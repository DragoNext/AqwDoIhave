import logging
import re

from bs4 import BeautifulSoup, Tag

from .tag_parser import parse_index_tag_images, parse_page_tags

logger = logging.getLogger(__name__)


def parse_merge_shop_page(html: str, slug: str, name: str = "") -> dict | None:
    """Parse a merge shop detail page.

    Returns dict with: name, slug, npc, location, tags, tabs[{name, items[...]}]
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

    # Location + NPC
    npc = {}
    location = {}
    for p in page_content.find_all("p"):
        strong = p.find("strong")
        if strong and "Location" in strong.get_text():
            # Try inline links first
            links = p.find_all("a")
            if not links:
                # Check next sibling <ul> for links (e.g. "Locations:" with UL below)
                # Use the last <li> with 2+ links (NPC - Location pattern)
                sib = p.next_sibling
                while sib:
                    if isinstance(sib, Tag) and sib.name == "ul":
                        for li in sib.find_all("li", recursive=False):
                            li_links = li.find_all("a")
                            if len(li_links) >= 2:
                                links = li_links
                            elif len(li_links) == 1 and not links:
                                links = li_links
                        break
                    elif isinstance(sib, Tag) and sib.name != "br":
                        break
                    sib = sib.next_sibling
            if len(links) >= 2:
                npc = {"name": links[0].get_text(strip=True), "slug": links[0].get("href", "")}
                location = {"name": links[1].get_text(strip=True), "slug": links[1].get("href", "")}
            elif len(links) == 1:
                location = {"name": links[0].get_text(strip=True), "slug": links[0].get("href", "")}
            break

    # Parse tabs
    tabs = []
    tabview = page_content.select_one("div.yui-navset")
    if tabview:
        tab_names = [em.get_text(strip=True) for em in tabview.select("ul.yui-nav li a em")]
        tab_panels = tabview.select("div.yui-content > div")
        for i, panel in enumerate(tab_panels):
            tab_name = tab_names[i] if i < len(tab_names) else f"Tab {i+1}"
            table = panel.select_one("table.wiki-content-table")
            if not table:
                continue
            items = _parse_shop_table(table)
            tabs.append({"name": tab_name, "items": items})
    else:
        # No tabs — single table
        for table in page_content.select("table.wiki-content-table"):
            items = _parse_shop_table(table)
            if items:
                tabs.append({"name": "Items", "items": items})

    return {
        "name": name,
        "slug": slug,
        "npc": npc,
        "location": location,
        "tags": raw_tags,
        "rare": tag_flags.get("rare", False),
        "pseudo_rare": tag_flags.get("pseudo_rare", False),
        "tabs": tabs,
    }


def _parse_shop_table(table: Tag) -> list[dict]:
    """Parse a wiki-content-table into a list of shop items."""
    rows = table.find_all("tr")
    if not rows:
        return []

    # Detect column layout from header
    headers = [th.get_text(strip=True).lower() for th in rows[0].find_all("th")]
    is_merge = "rank" not in headers  # 3 cols = merge, 4 cols = rep/gold shop

    items = []
    for row in rows[1:]:
        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        # Column 0: type icon
        type_icon = ""
        icon_img = cells[0].find("img")
        if icon_img:
            src = icon_img.get("src", "")
            fname = src.rsplit("/", 1)[-1].split(".")[0]
            type_icon = fname.replace("_Table", "").replace("_table", "")

        # Column 1: item name + tags
        name_link = cells[1].find("a")
        if not name_link:
            continue
        item_name = name_link.get_text(strip=True)
        item_slug = name_link.get("href", "")
        item_tags = parse_index_tag_images(cells[1])

        if is_merge:
            # Column 2: detect actual cost type per cell
            cell_text = cells[2].get_text(strip=True)
            cell_links = cells[2].find_all("a")

            if cell_links:
                # Has links — real merge ingredients
                ingredients = _parse_ingredients(cells[2])
                items.append({
                    "name": item_name,
                    "slug": item_slug,
                    "type_icon": type_icon,
                    "tags": item_tags,
                    "cost_type": "merge",
                    "ingredients": ingredients,
                })
            elif re.search(r"[\d,]+\s*AC", cell_text):
                items.append({
                    "name": item_name,
                    "slug": item_slug,
                    "type_icon": type_icon,
                    "tags": item_tags,
                    "cost_type": "ac",
                    "price": _parse_shop_price(cell_text),
                })
            elif re.search(r"[\d,]+\s*Gold", cell_text, re.IGNORECASE):
                items.append({
                    "name": item_name,
                    "slug": item_slug,
                    "type_icon": type_icon,
                    "tags": item_tags,
                    "cost_type": "gold",
                    "price": _parse_shop_price(cell_text),
                })
            else:
                # N/A or other — item no longer available for merge
                items.append({
                    "name": item_name,
                    "slug": item_slug,
                    "type_icon": type_icon,
                    "tags": item_tags,
                    "cost_type": "unavailable",
                })
        else:
            # Column 2: rank requirement
            rank_text = cells[2].get_text(strip=True) if len(cells) > 2 else ""
            rank_link = cells[2].find("a") if len(cells) > 2 else None
            rank = {}
            if rank_link:
                rank_match = re.search(r"Rank\s*(\d+)", rank_text)
                rank = {
                    "level": int(rank_match.group(1)) if rank_match else 0,
                    "faction": rank_link.get_text(strip=True),
                    "slug": rank_link.get("href", ""),
                }

            # Column 3: price
            price_text = cells[3].get_text(strip=True) if len(cells) > 3 else ""
            price = _parse_shop_price(price_text)

            items.append({
                "name": item_name,
                "slug": item_slug,
                "type_icon": type_icon,
                "tags": item_tags,
                "cost_type": "gold" if "Gold" in price_text else "ac",
                "price": price,
                "rank": rank,
            })

    return items


def _parse_ingredients(cell: Tag) -> list[dict]:
    """Parse ingredients from a merge shop price cell."""
    ingredients = []
    for link in cell.find_all("a"):
        ing_name = link.get_text(strip=True)
        ing_slug = link.get("href", "")
        # Find quantity: text after this link, look for xN
        next_text = ""
        sib = link.next_sibling
        if sib:
            next_text = str(sib)
        qty_match = re.search(r"x\s*(\d+)", next_text)
        qty = int(qty_match.group(1)) if qty_match else 1
        ingredients.append({"name": ing_name, "slug": ing_slug, "qty": qty})
    return ingredients


def _parse_shop_price(text: str) -> dict:
    """Parse a gold/AC price string like '30,000 Gold' or '500 AC'."""
    ac_match = re.search(r"([\d,]+)\s*AC", text)
    if ac_match:
        return {"amount": int(ac_match.group(1).replace(",", "")), "currency": "AC"}
    gold_match = re.search(r"([\d,]+)\s*Gold", text, re.IGNORECASE)
    if gold_match:
        return {"amount": int(gold_match.group(1).replace(",", "")), "currency": "Gold"}
    return {"amount": 0, "currency": "unknown"}
