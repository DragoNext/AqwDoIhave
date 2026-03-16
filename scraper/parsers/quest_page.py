import logging
import re

from bs4 import BeautifulSoup, NavigableString, Tag

from .tag_parser import parse_index_tag_images, parse_page_tags

logger = logging.getLogger(__name__)


def parse_quest_page(html: str, slug: str, name: str = "") -> dict | None:
    """Parse a quest page into structured data.

    Returns dict with: name, slug, location, npc, tags, quests[...]
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

    # Quest Location + NPC
    location = {}
    npc = {}
    for p in page_content.find_all("p"):
        text = p.get_text()
        if "Quest Location:" in text:
            for strong in p.find_all("strong"):
                st = strong.get_text(strip=True)
                if "Quest Location:" in st:
                    link = strong.find_next("a")
                    if link:
                        location = {"name": link.get_text(strip=True), "slug": link.get("href", "")}
                elif "Quests Begun From:" in st:
                    link = strong.find_next("a")
                    if link:
                        npc = {"name": link.get_text(strip=True), "slug": link.get("href", "")}
            break

    # Parse individual quests from tabs
    quests = []
    tabview = page_content.select_one("div.yui-navset")
    if tabview:
        tab_names = [em.get_text(strip=True) for em in tabview.select("ul.yui-nav li a em")]
        tab_panels = tabview.select("div.yui-content > div")
        for i, panel in enumerate(tab_panels):
            quest_name = tab_names[i] if i < len(tab_names) else f"Quest {i+1}"
            quest = _parse_single_quest(panel, quest_name)
            quests.append(quest)
    else:
        # Single quest, no tabs
        quest = _parse_single_quest(page_content, name)
        quests.append(quest)

    return {
        "name": name,
        "slug": slug,
        "location": location,
        "npc": npc,
        "tags": raw_tags,
        "rare": tag_flags.get("rare", False),
        "pseudo_rare": tag_flags.get("pseudo_rare", False),
        "quests": quests,
    }


def _parse_single_quest(container: Tag, quest_name: str) -> dict:
    """Parse a single quest from a tab panel or page content."""
    # Description: first <p> that isn't a strong-label paragraph
    description = ""
    for p in container.find_all("p", recursive=False):
        first_child = p.find()
        if first_child and first_child.name == "strong":
            continue
        text = p.get_text(strip=True)
        if text and len(text) > 10:
            description = text
            break

    # Items Required
    items_required = []
    req_header = _find_strong_section(container, "Items Required:")
    if req_header:
        ul = req_header.find_next("ul")
        if ul:
            items_required = _parse_required_items(ul)

    # Rewards
    rewards = _parse_rewards(container)

    return {
        "name": quest_name,
        "description": description,
        "items_required": items_required,
        "rewards": rewards,
    }


def _find_strong_section(container: Tag, label: str) -> Tag | None:
    """Find a <strong> element containing the given label text."""
    for strong in container.find_all("strong"):
        if label in strong.get_text():
            return strong
    return None


def _parse_required_items(ul: Tag) -> list[dict]:
    """Parse the Items Required <ul> list."""
    items = []
    for li in ul.find_all("li", recursive=False):
        # Item name + qty from the li text (before any nested ul)
        li_text = ""
        for child in li.children:
            if isinstance(child, NavigableString):
                li_text += str(child)
            elif isinstance(child, Tag) and child.name != "ul":
                li_text += child.get_text()
            else:
                break
        li_text = li_text.strip()

        qty_match = re.search(r"x\s*(\d+)", li_text)
        qty = int(qty_match.group(1)) if qty_match else 1
        item_name = re.sub(r"\s*x\s*\d+\s*$", "", li_text).strip()

        # Check if item name is linked
        item_link = li.find("a", recursive=False)
        if not item_link:
            # Check inside non-ul children
            for child in li.children:
                if isinstance(child, Tag) and child.name == "a":
                    item_link = child
                    break

        item_slug = item_link.get("href", "") if item_link else ""
        if item_link:
            item_name = item_link.get_text(strip=True)

        # Dropped by (nested ul)
        dropped_by = []
        nested_ul = li.find("ul")
        if nested_ul:
            for nested_li in nested_ul.find_all("li"):
                for link in nested_li.find_all("a"):
                    dropped_by.append({
                        "name": link.get_text(strip=True),
                        "slug": link.get("href", ""),
                    })

        items.append({
            "name": item_name,
            "slug": item_slug,
            "qty": qty,
            "dropped_by": dropped_by,
        })

    return items


def _parse_rewards(container: Tag) -> dict:
    """Parse the Rewards section."""
    rewards = {"gold": 0, "exp": 0, "rep": None, "items": []}

    header = _find_strong_section(container, "Rewards:")
    if not header:
        return rewards

    ul = header.find_next("ul")
    if not ul:
        return rewards

    for li in ul.find_all("li", recursive=False):
        text = li.get_text(strip=True)

        gold_match = re.search(r"([\d,]+)\s*Gold", text, re.IGNORECASE)
        if gold_match:
            rewards["gold"] = int(gold_match.group(1).replace(",", ""))
            continue

        exp_match = re.search(r"([\d,]+)\s*Exp", text, re.IGNORECASE)
        if exp_match:
            rewards["exp"] = int(exp_match.group(1).replace(",", ""))
            continue

        rep_match = re.search(r"([\d,]+)\s*Rep", text, re.IGNORECASE)
        if rep_match:
            faction_link = li.find("a")
            rewards["rep"] = {
                "amount": int(rep_match.group(1).replace(",", "")),
                "faction": faction_link.get_text(strip=True) if faction_link else "",
                "slug": faction_link.get("href", "") if faction_link else "",
            }
            continue

        # Item reward
        link = li.find("a")
        if link:
            item_tags = parse_index_tag_images(li)
            rewards["items"].append({
                "name": link.get_text(strip=True),
                "slug": link.get("href", ""),
                "tags": item_tags,
            })

    # Also check "You may also receive, at random:" section
    random_header = _find_strong_section(container, "at random:")
    if random_header:
        random_ul = random_header.find_next("ul")
        if random_ul:
            for li in random_ul.find_all("li", recursive=False):
                link = li.find("a")
                if link:
                    item_tags = parse_index_tag_images(li)
                    rewards["items"].append({
                        "name": link.get_text(strip=True),
                        "slug": link.get("href", ""),
                        "tags": item_tags,
                        "random": True,
                    })

    return rewards
