import logging
import re

from bs4 import BeautifulSoup, NavigableString, Tag

from ..models import ItemDetail
from .price_parser import parse_price, parse_sellback
from .tag_parser import parse_page_tags

logger = logging.getLogger(__name__)


def parse_item_page(html: str, wiki_path: str, category: str, name: str = "") -> ItemDetail:
    soup = BeautifulSoup(html, "lxml")
    page_content = soup.select_one("#page-content")
    if not page_content:
        logger.warning("No #page-content found for %s", wiki_path)
        return ItemDetail(name=name or wiki_path, wiki_path=wiki_path, category=category)

    if not name:
        title_el = soup.select_one("#page-title")
        name = title_el.get_text(strip=True) if title_el else wiki_path.lstrip("/").replace("-", " ").title()

    raw_tags, tag_flags = parse_page_tags(soup)
    fields = _extract_fields(page_content)

    price_text = fields.get("Price", {}).get("text", "")
    price_strong = fields.get("Price", {}).get("strong")
    price_next_ul = fields.get("Price", {}).get("next_ul")
    price = parse_price(price_strong, price_text, page_content, price_next_ul, raw_tags)

    sellback_text = fields.get("Sellback", {}).get("text", "")
    sellback_strong = fields.get("Sellback", {}).get("strong")
    sellback_next_ul = fields.get("Sellback", {}).get("next_ul")
    sellback = parse_sellback(sellback_strong, sellback_text, page_content, sellback_next_ul)

    description = fields.get("Description", {}).get("text", "")
    if description:
        # Truncate at double-newline (prevents tab content/credits from leaking)
        nl_idx = description.find("\n\n")
        if nl_idx >= 0:
            description = description[:nl_idx]
        description = " " + description

    # Wiki uses "Base Damage:" for weapons, fall back to "Damage:" for compat
    damage_field = fields.get("Base Damage", fields.get("Damage", {}))
    damage_text = damage_field.get("text", "N/A") or "N/A"
    damage_match = re.search(r"(\d+)\s*-\s*(\d+)", damage_text)
    if damage_match:
        min_dmg = int(damage_match.group(1))
        max_dmg = int(damage_match.group(2))
        notes_ul = fields.get("Notes", fields.get("Note", {})).get("next_ul")
        bonus = _parse_bonus_damage(notes_ul)
        damage = [min_dmg, max_dmg, bonus]
    else:
        damage = "N/A"

    # Location: parse from Location/Locations field
    loc_field = fields.get("Location", fields.get("Locations", {}))
    location = _parse_location(loc_field)

    image_urls = _extract_item_images(page_content)

    return ItemDetail(
        name=name,
        wiki_path=wiki_path,
        category=category,
        price=price,
        sellback=sellback,
        description=description,
        damage=damage,
        location=location,
        rare=tag_flags.get("rare", False),
        ac=tag_flags.get("ac", False),
        legend=tag_flags.get("legend", False),
        seasonal=tag_flags.get("seasonal", False),
        pseudo_rare=tag_flags.get("pseudo_rare", False),
        special_offer=tag_flags.get("special_offer", False),
        beta=tag_flags.get("beta", False),
        color_custom=tag_flags.get("color_custom", False),
        custom_animation=tag_flags.get("custom_animation", False),
        image_urls=image_urls,
        page_tags=raw_tags,
    )


def _extract_fields(page_content: Tag) -> dict:
    """Extract field values from <strong>Label:</strong> patterns.

    Returns dict mapping field names to:
      text: inline text after the <strong>
      strong: the <strong> Tag itself
      next_ul: the first <ul> sibling after the parent <p> (for merge/tiered data)
    """
    fields = {}
    for strong in page_content.find_all("strong"):
        text = strong.get_text(strip=True)
        # Some wiki pages have <strong>Price</strong> without a colon
        if text.endswith(":"):
            field_name = text.rstrip(":")
        elif text in ("Price", "Sellback", "Location", "Locations",
                       "Description", "Rarity", "Damage", "Type", "Notes"):
            field_name = text
        else:
            continue

        # Collect inline text after <strong> until next <strong> or <br>
        value_parts = []
        sibling = strong.next_sibling
        while sibling:
            if isinstance(sibling, NavigableString):
                value_parts.append(str(sibling))
            elif isinstance(sibling, Tag):
                if sibling.name == "strong":
                    break
                if sibling.name == "br":
                    break
                value_parts.append(sibling.get_text())
            sibling = sibling.next_sibling

        value = "".join(value_parts).strip()

        # Find the next <ul> after the parent element (for merge ingredients,
        # tiered sellback, quest rewards that live outside the <p>)
        next_ul = None
        parent = strong.parent
        if parent and parent != page_content:
            # Walk siblings of the parent <p> to find <ul> elements.
            start_sib = parent.next_sibling
        elif parent == page_content:
            # <strong> is a direct child of #page-content — walk its own siblings.
            start_sib = strong.next_sibling
        else:
            start_sib = None

        if start_sib is not None:
            # Some pages use <p>OR</p> between multiple <ul> blocks
            # (e.g. alchemy "Mix or Merge" pages) — skip those separators.
            all_uls = []
            p_sib = start_sib
            while p_sib:
                if isinstance(p_sib, Tag):
                    if p_sib.name == "ul":
                        all_uls.append(p_sib)
                    elif p_sib.name == "p":
                        p_text = p_sib.get_text(strip=True)
                        if p_text.upper() == "OR":
                            p_sib = p_sib.next_sibling
                            continue
                        break
                    elif p_sib.name == "div":
                        # Collapsible blocks contain drop/quest data in inner <ul>s
                        for inner_ul in p_sib.find_all("ul"):
                            all_uls.append(inner_ul)
                    elif p_sib.name == "br":
                        # Skip <br/> separators (e.g. between collapsible block and merge UL)
                        p_sib = p_sib.next_sibling
                        continue
                    elif p_sib.name == "strong":
                        # Skip standalone <strong>OR</strong> separators
                        if p_sib.get_text(strip=True).upper() == "OR":
                            p_sib = p_sib.next_sibling
                            continue
                        break
                    else:
                        break
                p_sib = p_sib.next_sibling
            # Prefer UL with merge/drop/quest data over generic ones.
            # Priority: merge > drop > reward (matches parse_price Phase 1).
            for keyword in ["merge the following", "dropped by", "reward"]:
                for ul in all_uls:
                    ul_lower = ul.get_text(" ", strip=True).lower()
                    parent_block = ul.find_parent("div", class_="collapsible-block")
                    if parent_block:
                        ul_lower = parent_block.get_text(" ", strip=True).lower()
                    if keyword in ul_lower:
                        next_ul = ul
                        break
                if next_ul is not None:
                    break
            if next_ul is None and all_uls:
                next_ul = all_uls[0]

        # First occurrence wins — tabbed pages have duplicate fields per tab,
        # and the first tab is the current/latest version.
        if field_name not in fields:
            fields[field_name] = {
                "text": value,
                "strong": strong,
                "next_ul": next_ul,
            }

    return fields


def _parse_location(loc_field: dict) -> list:
    """Parse Location/Locations field.

    Returns list of location entries. Each entry is:
      [shop_name, shop_slug, map_name, map_slug] or
      [name, slug] if only one link.
    Single inline: "Shop Name - Map Name" with <a> links.
    UL: multiple <li> entries with links.
    """
    if not loc_field:
        return ["N/A"]

    text = loc_field.get("text", "")
    strong = loc_field.get("strong")
    next_ul = loc_field.get("next_ul")

    locations = []

    # 1. Always try inline links first (between <strong>Location:</strong> and <br>/<strong>)
    if strong:
        links = []
        sib = strong.next_sibling
        while sib:
            if isinstance(sib, Tag):
                if sib.name in ("strong", "br"):
                    break
                if sib.name == "a":
                    links.append(sib)
            sib = sib.next_sibling
        if links:
            entry = []
            for link in links:
                name = link.get_text(strip=True)
                slug = link.get("href", "").lstrip("/")
                if name and slug:
                    entry.extend([name, slug])
            if entry:
                locations.append(entry)

    # 2. For "Locations:" (plural, inline empty), use next_ul but ONLY if it
    #    doesn't contain drop/merge/quest data (which belongs to Price).
    if not locations and next_ul:
        ul_text = next_ul.get_text(" ", strip=True).lower()
        is_price_ul = any(kw in ul_text for kw in
                          ["merge the following", "dropped by", "reward from"])
        if not is_price_ul:
            for li in next_ul.find_all("li", recursive=False):
                links = li.find_all("a")
                if not links:
                    continue
                entry = []
                for link in links:
                    name = link.get_text(strip=True)
                    slug = link.get("href", "").lstrip("/")
                    if name and slug:
                        entry.extend([name, slug])
                if entry:
                    locations.append(entry)

    if not locations:
        if text and text != "N/A":
            return [text]
        return ["N/A"]

    return locations


def _parse_bonus_damage(notes_ul: Tag | None) -> list | None:
    """Parse bonus damage from Notes UL.

    Looks for: 'When equipped, this item does X% more damage to Y Monsters.'
    Returns ['X', 'Type1', 'Type2', ...] or None.
    """
    if not notes_ul:
        return None
    for li in notes_ul.find_all("li", recursive=False):
        text = li.get_text(" ", strip=True)
        match = re.search(r"(\d+)%\s*more damage to\s+(.+)", text, re.IGNORECASE)
        if match:
            pct = match.group(1)
            targets_text = match.group(2).rstrip(".")
            # "all monsters" → "All"
            if targets_text.lower().startswith("all"):
                return [pct, "All"]
            # "Human Monsters" → "Human"; "Undead, Chaos, Dragon... Monsters" → split
            targets_text = re.sub(r"\s*Monsters?\s*$", "", targets_text, flags=re.IGNORECASE)
            parts = re.split(r",\s*|\s+and\s+", targets_text)
            result = [pct]
            for part in parts:
                part = re.sub(r"^and\s+", "", part).strip()
                if part:
                    result.append(part)
            return result
    return None


def _is_skill_image(src: str) -> bool:
    """Filter out class skill icons and other non-item images."""
    return "classes-skills" in src or "Skill" in src


def _extract_item_images(page_content: Tag) -> list[str]:
    images = []
    for tab in page_content.select("[id^='wiki-tab-0-']"):
        img = tab.select_one("img")
        if img and img.get("src"):
            src = img["src"]
            if "image-tags" not in src and not _is_skill_image(src):
                images.append(src)
    if not images:
        for img in page_content.find_all("img"):
            src = img.get("src", "")
            if src and "image-tags" not in src and "wikidot" not in src and not _is_skill_image(src):
                images.append(src)
    return images
