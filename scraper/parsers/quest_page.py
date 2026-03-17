import logging
import re

from bs4 import BeautifulSoup, NavigableString, Tag

from .tag_parser import parse_index_tag_images, parse_page_tags

logger = logging.getLogger(__name__)


def parse_quest_page(html: str, slug: str, name: str = "") -> dict | None:
    """Parse a quest page into structured data.

    Handles both simple single-section quest pages and large pages that contain
    multiple anchored quest sections with their own tabviews, locations, and
    requirements.
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
    sections = _extract_quest_sections(page_content)

    quests = []
    page_locations = []
    page_npcs = []

    for section in sections:
        if section["location"]:
            page_locations.append(section["location"])
        if section["npc"]:
            page_npcs.append(section["npc"])

        tabview = section.get("tabview")
        if tabview:
            tab_names = [em.get_text(strip=True) for em in tabview.select("ul.yui-nav li a em")]
            tab_panels = tabview.select("div.yui-content > div")
            for i, panel in enumerate(tab_panels):
                quest_name = tab_names[i] if i < len(tab_names) else f"Quest {i + 1}"
                quests.append(_parse_single_quest(panel, quest_name, section))
        else:
            container = section.get("container")
            if container:
                quests.append(_parse_single_quest(container, section.get("name") or name, section))

    if not quests:
        fallback_section = _parse_section_meta([], slug)
        fallback_section["container"] = page_content
        quests.append(_parse_single_quest(page_content, name, fallback_section))

    return {
        "name": name,
        "slug": slug,
        "location": _collapse_shared_links(page_locations),
        "npc": _collapse_shared_links(page_npcs),
        "tags": raw_tags,
        "rare": tag_flags.get("rare", False),
        "pseudo_rare": tag_flags.get("pseudo_rare", False),
        "quests": quests,
    }


def _extract_quest_sections(page_content: Tag) -> list[dict]:
    sections = []
    section_nodes = []
    last_location = {}
    last_npc = {}

    for child in page_content.children:
        if not isinstance(child, Tag):
            continue
        section_nodes.append(child)
        if child.name == "div" and "yui-navset" in (child.get("class") or []):
            section = _build_section(section_nodes)
            if not section.get("location") and last_location:
                section["location"] = last_location
            if not section.get("npc") and last_npc:
                section["npc"] = last_npc
            if section.get("location"):
                last_location = section["location"]
            if section.get("npc"):
                last_npc = section["npc"]
            sections.append(section)
            section_nodes = []

    if not sections and section_nodes:
        sections.append(_build_section(section_nodes))

    return sections


def _build_section(nodes: list[Tag]) -> dict:
    tabview = None
    meta_nodes = []
    for node in nodes:
        if node.name == "div" and "yui-navset" in (node.get("class") or []):
            tabview = node
            break
        meta_nodes.append(node)

    section = _parse_section_meta(meta_nodes)
    section["tabview"] = tabview
    if not tabview:
        section["container"] = meta_nodes[-1] if meta_nodes else None
    return section


def _parse_section_meta(nodes: list[Tag], fallback_slug: str = "") -> dict:
    anchor = ""
    location = {}
    npc = {}
    requirements_notes = []

    for index, node in enumerate(nodes):
        anchor_tag = node.find("a", attrs={"name": True})
        if anchor_tag and anchor_tag.get("name") and anchor_tag.get("name") != "page-top":
            anchor = anchor_tag.get("name")

        text = node.get_text(" ", strip=True)
        if not text:
            continue

        next_node = nodes[index + 1] if index + 1 < len(nodes) else None
        normalized = text.lower()

        if any(label in normalized for label in ("quest locations:", "quest location:", "locations:", "location:")):
            location = _extract_labeled_link(node, next_node, pick="first") or location

        if any(label in normalized for label in ("quests begun from:", "quest begun from:")):
            npc = _extract_labeled_link(node, next_node, pick="last") or npc

        if "Requirements:" in text:
            note = _extract_requirement_text(node)
            if note:
                requirements_notes.append(note)

    return {
        "anchor": anchor,
        "anchor_slug": (fallback_slug or "") + ("#" + anchor if fallback_slug and anchor else ""),
        "location": location,
        "npc": npc,
        "requirements_note": " | ".join(dict.fromkeys(requirements_notes)),
    }


def _extract_labeled_link(node: Tag, next_node: Tag | None, pick: str = "first") -> dict:
    links = node.find_all("a", href=True)
    if not links and next_node and next_node.name == "ul":
        links = next_node.find_all("a", href=True)
    if not links:
        return {}
    link = links[-1] if pick == "last" else links[0]
    return {"name": link.get_text(strip=True), "slug": link.get("href", "")}


def _extract_requirement_text(node: Tag) -> str:
    text = node.get_text(" ", strip=True)
    match = re.search(r"Requirements:\s*(.+)$", text)
    if not match:
        return ""
    return match.group(1).strip()


def _collapse_shared_links(values: list[dict]) -> dict:
    cleaned = [value for value in values if value and value.get("name")]
    if not cleaned:
        return {}
    first = cleaned[0]
    if all(value.get("name") == first.get("name") and value.get("slug") == first.get("slug") for value in cleaned[1:]):
        return first
    return {}


def _parse_single_quest(container: Tag, quest_name: str, section: dict) -> dict:
    """Parse a single quest from a tab panel or page content."""
    description = ""
    requirements_notes = []

    for p in container.find_all("p", recursive=False):
        first_child = p.find()
        text = p.get_text(" ", strip=True)
        if not text:
            continue

        if text.startswith("Requirements:"):
            note = _extract_requirement_text(p)
            if note:
                requirements_notes.append(note)
            continue

        if first_child and first_child.name == "strong":
            continue

        if len(text) > 10:
            description = text
            break

    items_required = []
    req_header = _find_strong_section(container, "Items Required:")
    if req_header:
        ul = req_header.find_next("ul")
        if ul:
            items_required = _parse_required_items(ul)

    rewards = _parse_rewards(container)
    combined_requirements = []
    if section.get("requirements_note"):
        combined_requirements.append(section["requirements_note"])
    combined_requirements.extend(requirements_notes)

    return {
        "name": quest_name,
        "description": description,
        "location": section.get("location", {}),
        "npc": section.get("npc", {}),
        "section_anchor": section.get("anchor", ""),
        "section_slug": section.get("anchor_slug", ""),
        "requirements_note": " | ".join(dict.fromkeys([note for note in combined_requirements if note])),
        "items_required": items_required,
        "rewards": rewards,
    }


def _find_strong_section(container: Tag, label: str) -> Tag | None:
    """Find a <strong> element containing the given label text."""
    for strong in container.find_all("strong"):
        if label in strong.get_text():
            return strong
    return None


def _extract_qty(text: str) -> int:
    """Extract trailing wiki quantity markers like 'x14' or 'x 1'."""
    match = re.search(r"(?:^|\s)x\s*(\d[\d,]*)\b", text)
    if not match:
        return 1
    return int(match.group(1).replace(",", ""))


def _parse_required_items(ul: Tag) -> list[dict]:
    """Parse the Items Required <ul> list."""
    items = []
    for li in ul.find_all("li", recursive=False):
        li_text = ""
        for child in li.children:
            if isinstance(child, NavigableString):
                li_text += str(child)
            elif isinstance(child, Tag) and child.name != "ul":
                li_text += child.get_text()
            else:
                break
        li_text = re.sub(r"\s+", " ", li_text).strip()

        qty = _extract_qty(li_text)
        item_name = re.sub(r"\s*x\s*[\d,]+\s*(\(.*\))?\s*$", "", li_text).strip()

        item_link = li.find("a", recursive=False)
        if not item_link:
            for child in li.children:
                if isinstance(child, Tag) and child.name == "a":
                    item_link = child
                    break

        item_slug = item_link.get("href", "") if item_link else ""
        if item_link:
            item_name = item_link.get_text(strip=True)

        if not item_name or item_name.upper() == "N/A":
            continue

        dropped_by = []
        nested_ul = li.find("ul")
        if nested_ul:
            for nested_li in nested_ul.find_all("li"):
                for link in nested_li.find_all("a", href=True):
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
        text = li.get_text(" ", strip=True)

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
            faction_link = li.find("a", href=True)
            rewards["rep"] = {
                "amount": int(rep_match.group(1).replace(",", "")),
                "faction": faction_link.get_text(strip=True) if faction_link else "",
                "slug": faction_link.get("href", "") if faction_link else "",
            }
            continue

        link = li.find("a", href=True)
        if link:
            item_tags = parse_index_tag_images(li)
            qty = _extract_qty(text)
            rewards["items"].append({
                "name": link.get_text(strip=True),
                "slug": link.get("href", ""),
                "tags": item_tags,
                "qty": qty,
            })

    random_header = _find_strong_section(container, "at random:")
    if random_header:
        random_ul = random_header.find_next("ul")
        if random_ul:
            for li in random_ul.find_all("li", recursive=False):
                link = li.find("a", href=True)
                if link:
                    item_tags = parse_index_tag_images(li)
                    text = li.get_text(" ", strip=True)
                    qty = _extract_qty(text)
                    rewards["items"].append({
                        "name": link.get_text(strip=True),
                        "slug": link.get("href", ""),
                        "tags": item_tags,
                        "qty": qty,
                        "random": True,
                    })

    for label, extra in (
        ("Items:", {}),
        ("Item:", {}),
        ("You may also choose one of:", {"choice": True}),
        ("You may choose one of:", {"choice": True}),
        ("Choose one of:", {"choice": True}),
    ):
        items_header = _find_strong_section(container, label)
        if not items_header:
            continue
        items_ul = items_header.find_next("ul")
        if not items_ul:
            continue
        for li in items_ul.find_all("li", recursive=False):
            link = li.find("a", href=True)
            if not link:
                continue
            item_tags = parse_index_tag_images(li)
            text = li.get_text(" ", strip=True)
            qty = _extract_qty(text)
            rewards["items"].append({
                "name": link.get_text(strip=True),
                "slug": link.get("href", ""),
                "tags": item_tags,
                "qty": qty,
                **extra,
            })

    return rewards
