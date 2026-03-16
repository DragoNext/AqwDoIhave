import logging
import re

from bs4 import BeautifulSoup, NavigableString, Tag

from .tag_parser import parse_index_tag_images, parse_page_tags

logger = logging.getLogger(__name__)


def parse_location_page(html: str, slug: str, name: str = "") -> dict | None:
    """Parse a location/map page.

    Returns dict with: name, slug, map_name, join_cmd, room_limit, description,
    monsters, npcs, shops, quests, access_points, tags
    """
    soup = BeautifulSoup(html, "lxml")
    page_content = soup.select_one("#page-content")
    if not page_content:
        logger.warning("No #page-content for %s", slug)
        return None

    if not name:
        title = soup.select_one("title")
        name = title.get_text(strip=True).replace(" - AQW", "") if title else slug.lstrip("/")

    raw_tags, tag_flags = parse_page_tags(soup)

    # Description: first <p> with a <span> containing text
    description = ""
    for p in page_content.find_all("p", recursive=False):
        span = p.find("span")
        if span:
            text = span.get_text(strip=True)
            if text and len(text) > 20:
                description = text
                break

    # Parse sections by finding <strong>Label:</strong> patterns
    sections = _parse_sections(page_content)

    # Map metadata
    map_name = ""
    room_limit = 0
    join_cmd = ""

    map_name_raw = sections.get("Map Name", "")
    if map_name_raw:
        map_name = map_name_raw.strip()

    room_limit_raw = sections.get("Room Limit", "")
    if room_limit_raw:
        m = re.search(r"(\d+)", room_limit_raw)
        if m:
            room_limit = int(m.group(1))

    # Access points
    access_points = []
    access_ul = sections.get("_ul_Access Points")
    if access_ul:
        for li in access_ul.find_all("li", recursive=False):
            text = li.get_text(strip=True)
            access_points.append(text)
            if text.startswith("/join"):
                join_cmd = text

    # If no /join found in access points, try to derive from map name
    if not join_cmd and map_name:
        join_cmd = f"/join {map_name}"

    # Monsters
    monsters = _parse_link_list(sections.get("_ul_Monsters"))

    # NPCs
    npcs = _parse_link_list(sections.get("_ul_NPCs"))

    # Shops
    shops = _parse_link_list(sections.get("_ul_Shops"))

    # Quests
    quests = _parse_link_list(sections.get("_ul_Quests"))

    return {
        "name": name,
        "slug": slug,
        "map_name": map_name,
        "join_cmd": join_cmd,
        "room_limit": room_limit,
        "description": description,
        "monsters": monsters,
        "npcs": npcs,
        "shops": shops,
        "quests": quests,
        "access_points": access_points,
        "tags": raw_tags,
        "rare": tag_flags.get("rare", False),
        "pseudo_rare": tag_flags.get("pseudo_rare", False),
    }


def _parse_sections(page_content: Tag) -> dict:
    """Extract labeled sections from the page content.

    Returns dict with:
    - "Label" → text value (for inline fields like Map Name)
    - "_ul_Label" → the <ul> Tag following that label (for list sections)
    """
    sections = {}
    for strong in page_content.find_all("strong"):
        text = strong.get_text(strip=True)
        if not text.endswith(":"):
            continue
        label = text.rstrip(":")

        # Inline text value (siblings after strong until br/strong)
        value_parts = []
        sib = strong.next_sibling
        while sib:
            if isinstance(sib, NavigableString):
                value_parts.append(str(sib))
            elif isinstance(sib, Tag):
                if sib.name in ("strong", "br"):
                    break
                value_parts.append(sib.get_text())
            sib = sib.next_sibling
        sections[label] = "".join(value_parts).strip()

        # Find following <ul> for this section
        parent = strong.parent
        if parent:
            next_ul = parent.find_next_sibling("ul")
            if next_ul:
                sections[f"_ul_{label}"] = next_ul
            # Also check collapsible blocks after parent
            next_sib = parent.find_next_sibling()
            if next_sib and "collapsible-block" in (next_sib.get("class") or []):
                content = next_sib.select_one("div.collapsible-block-content ul")
                if content and f"_ul_{label}" not in sections:
                    sections[f"_ul_{label}"] = content

    return sections


def _parse_link_list(ul: Tag | None) -> list[dict]:
    """Parse a <ul> of links into a list of {name, slug, count?, tags}."""
    if not ul:
        return []
    items = []
    for li in ul.find_all("li", recursive=False):
        link = li.find("a")
        if not link:
            text = li.get_text(strip=True)
            if text and text != "N/A":
                items.append({"name": text, "slug": ""})
            continue
        item_name = link.get_text(strip=True)
        item_slug = link.get("href", "")
        tags = parse_index_tag_images(li)

        # Check for count (e.g. "x5" after the link)
        count = None
        li_text = li.get_text(strip=True)
        count_match = re.search(r"x\s*(\d+)", li_text)
        if count_match:
            count = int(count_match.group(1))

        entry = {"name": item_name, "slug": item_slug}
        if tags:
            entry["tags"] = tags
        if count is not None:
            entry["count"] = count
        items.append(entry)
    return items
