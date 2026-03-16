import logging

from bs4 import BeautifulSoup, Tag

from .tag_parser import parse_page_tags

logger = logging.getLogger(__name__)


def parse_npc_page(html: str, slug: str, name: str = "") -> dict | None:
    """Parse an NPC page.

    Returns dict with: name, slug, tags, locations[{name, slug, role, quests, shops}]
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

    locations = []
    tabview = page_content.select_one("div.yui-navset")
    if tabview:
        tab_names = [em.get_text(strip=True) for em in tabview.select("ul.yui-nav li a em")]
        tab_panels = tabview.select("div.yui-content > div")
        for i, panel in enumerate(tab_panels):
            tab_name = tab_names[i] if i < len(tab_names) else ""
            # Only treat tabs starting with "At " as locations.
            # Skip art version tabs (New/Old), dialogue, screen, variant tabs.
            if not tab_name.startswith("At ") and not _is_location_tab(tab_name):
                continue
            loc = _parse_npc_tab(panel, tab_name)
            locations.append(loc)

    # Fallback: if tabview exists but all tabs were filtered out (art/version tabs),
    # the NPC data lives in the main page_content outside the tabview.
    if not locations:
        loc = _parse_npc_tab(page_content, "")
        if loc["quests"] or loc["shops"] or loc["role"]:
            locations.append(loc)

    return {
        "name": name,
        "slug": slug,
        "tags": raw_tags,
        "rare": tag_flags.get("rare", False),
        "pseudo_rare": tag_flags.get("pseudo_rare", False),
        "locations": locations,
    }


_NON_LOCATION_PATTERNS = {
    "new", "old", "older", "oldest", "original",
    "male", "female",
    "normal", "hard", "chaos",
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
}


def _is_location_tab(tab_name: str) -> bool:
    """Check if a tab name looks like a real game location (not art/dialogue/version)."""
    lower = tab_name.lower().strip()
    # Exact match against known non-location names
    if lower in _NON_LOCATION_PATTERNS:
        return False
    # Pattern-based rejection
    if lower.startswith(("screen ", "version ", "dialogue ", "v.")):
        return False
    if lower.startswith(("phase ", "form ", "stage ")):
        return False
    # If it doesn't start with "At " but looks like a location (contains real words),
    # accept it cautiously — some NPC pages use location names without "At " prefix
    return True


def _parse_npc_tab(panel: Tag, tab_name: str) -> dict:
    """Parse a single NPC location tab."""
    # Location name from tab name "At {Location}"
    loc_name = tab_name
    if loc_name.startswith("At "):
        loc_name = loc_name[3:]

    # Role from red <strong> text
    role = ""
    for span in panel.find_all("span", style=True):
        if "color" in (span.get("style") or "") and "red" in span.get("style", ""):
            strong = span.find("strong")
            if strong:
                role = strong.get_text(strip=True)
                break

    # Collect all links — categorize into quests and shops by context
    quests = []
    shops = []
    seen_slugs = set()

    for link in panel.find_all("a", href=True):
        href = link.get("href", "")
        link_text = link.get_text(strip=True)
        if not href or not link_text:
            continue
        # Skip anchors and external links
        if not href.startswith("/"):
            continue

        # Strip anchor fragments for dedup
        base_href = href.split("#")[0]
        if base_href in seen_slugs:
            continue
        seen_slugs.add(base_href)

        # Heuristic: quest links often contain "quest" in slug or text
        lower_text = link_text.lower()
        lower_href = href.lower()
        if "quest" in lower_text or "quest" in lower_href:
            quests.append({"name": link_text, "slug": href})
        elif "merge" in lower_text or "shop" in lower_text or "merge" in lower_href or "shop" in lower_href:
            shops.append({"name": link_text, "slug": href})
        elif link.parent and link.parent.name == "strong":
            # Bold links are usually actionable (quests/shops)
            # Try to categorize by checking nearby text
            parent_text = link.parent.get_text(strip=True).lower()
            if "quest" in parent_text:
                quests.append({"name": link_text, "slug": href})
            else:
                shops.append({"name": link_text, "slug": href})

    return {
        "location": loc_name,
        "role": role,
        "quests": quests,
        "shops": shops,
    }
