import logging
import re

from bs4 import Tag

logger = logging.getLogger(__name__)


def parse_price(price_strong: Tag | None, price_text: str, page_content: Tag,
                next_ul: Tag | None = None, page_tags: list[str] | None = None) -> list:
    """Parse the Price field from an item page.

    Args:
        price_strong: The <strong>Price:</strong> element itself.
        price_text: Inline text extracted after Price:.
        page_content: The #page-content element.
        next_ul: The <ul> sibling after the Price paragraph (may contain merge/quest/drop info).
        page_tags: List of page tag strings (from div.page-tags).
    """
    text = price_text.strip()
    tags = set(page_tags or [])

    # Early: check page tags for temporary items (price text is usually just "N/A")
    if "temporary" in tags:
        return ["TEMPORARY"]

    # Check the next_ul for merge/quest/drop info — this is critical because
    # many items say "Price: N/A" inline but have the real info in a <ul> below.
    ul_text = ""
    if next_ul:
        ul_text = next_ul.get_text(" ", strip=True)
        # For ULs inside collapsible blocks, include parent block text as context
        parent_block = next_ul.find_parent("div", class_="collapsible-block")
        if parent_block:
            ul_text = parent_block.get_text(" ", strip=True)

    # --- Phase 1: keyword found in the <ul> text → <ul> has the real data ---
    # Priority: Merge > Drop > Reward
    #   Merge provides the richest data (shop name + ingredients).
    #   _has_toplevel_drop() only checks top-level <li> items, so nested
    #   "Dropped by" inside merge ingredient descriptions won't trigger it.
    # "Merge the following" = actual merge ingredients list
    # "Used to merge" = just a note (NOT a merge price)
    if "merge the following" in ul_text.lower():
        return _parse_merge(price_strong, page_content, next_ul)

    if next_ul and _has_toplevel_drop(next_ul):
        return _parse_drop(price_strong, page_content, next_ul)

    # For collapsible blocks, "Dropped by" is in parent div, not in <li> text
    if next_ul and "Dropped by" in ul_text and next_ul.find_parent("div", class_="collapsible-block"):
        return _parse_drop_from_links(next_ul.find_all("a"))

    if "Reward" in ul_text:
        return _parse_quest_from_ul(next_ul, price_strong, page_content)

    # --- Phase 2: keyword found in inline text → parse from inline siblings ---
    # Do NOT pass next_ul here — it's unrelated (usually Notes/Also see)
    if "Dropped by" in text or "Drops from" in text:
        return _parse_drop(price_strong, page_content, None)

    if "Reward" in text:
        return _parse_quest_inline(price_strong)

    if "Merge" in text:
        return _parse_merge(price_strong, page_content, None)

    # AC price: "X AC" — check inline text first, then UL list items
    ac_match = re.search(r"([\d,]+)\s*AC", text)
    if ac_match:
        return ["AC", " " + ac_match.group(1)]

    # Gold price — check inline text first, then UL list items
    gold_match = re.search(r"([\d,]+)\s*Gold", text, re.IGNORECASE)
    if gold_match:
        return ["GOLD", " " + gold_match.group(1)]

    # Some pages have price in a UL <li> (e.g. "<li>1,000 Gold</li>")
    if next_ul:
        for li in next_ul.find_all("li", recursive=False):
            li_text = li.get_text(strip=True)
            li_ac = re.match(r"^([\d,]+)\s*AC$", li_text)
            if li_ac:
                return ["AC", " " + li_ac.group(1)]
            li_gold = re.match(r"^([\d,]+)\s*Gold$", li_text, re.IGNORECASE)
            if li_gold:
                return ["GOLD", " " + li_gold.group(1)]

    # Bare number without currency suffix (e.g. "1,000") — assume Gold
    bare_match = re.match(r"^([\d,]+)$", text)
    if bare_match:
        return ["GOLD", " " + bare_match.group(1)]

    # Temporary items (also check inline text)
    if "Temporary" in text or "temporary" in text:
        return ["TEMPORARY"]

    # Login Reward: "Login Reward", "Log in", "Daily login"
    if "Login Reward" in text or "login reward" in text:
        return ["Login Reward"]
    if "daily" in tags and ("Log in" in text or "log in" in text.lower()):
        return ["Login Reward"]

    # Quest: inline text with "Quest" keyword
    if "Quest" in text:
        return _parse_quest_inline(price_strong)

    # Fallback: check inline links (could be a drop or quest with just a link)
    if price_strong:
        # Look for links in siblings of the <strong>, not in the whole parent
        links = _get_sibling_links(price_strong)
        if links:
            return _parse_drop_from_links(links)

    if not text or text == "N/A":
        return ["N/A"]

    return ["N/A"]


def _has_toplevel_drop(ul: Tag) -> bool:
    """Check if a <ul> has 'Dropped by' in a top-level <li> (not nested inside merge ingredients).

    Must be specific to avoid matching Notes like 'Drop quantity is periodically boosted...'
    """
    for li in ul.find_all("li", recursive=False):
        li_text = li.get_text(strip=True)
        if li_text.startswith("Dropped by") or li_text.startswith("Drops from"):
            return True
    return False


def _get_sibling_links(strong: Tag) -> list[Tag]:
    """Get <a> links that are siblings of the <strong> tag."""
    links = []
    sib = strong.next_sibling
    while sib:
        if isinstance(sib, Tag):
            if sib.name == "strong":
                break
            if sib.name == "br":
                break
            if sib.name == "a":
                links.append(sib)
            else:
                links.extend(sib.find_all("a"))
        sib = sib.next_sibling
    return links


def _parse_drop(price_strong: Tag | None, page_content: Tag,
                next_ul: Tag | None = None) -> list:
    """Parse a Drop price from inline links or a <ul>."""
    # Check <ul> for "Dropped by" entries — only look at <li> items that
    # contain "Dropped by", not the whole UL (which may also have Merge info)
    if next_ul:
        links = []
        for li in next_ul.find_all("li", recursive=False):
            li_text = li.get_text(strip=True)
            if "Dropped by" in li_text or li_text.startswith("Drops from"):
                links.extend(li.find_all("a"))
        if links:
            return _parse_drop_from_links(links)

    # Fallback to inline links
    if price_strong:
        links = _get_sibling_links(price_strong)
        if links:
            return _parse_drop_from_links(links)

    return ["Drop", "Unknown", "unknown"]


def _parse_drop_from_links(links: list[Tag]) -> list:
    """Build a Drop price entry from a list of <a> tags."""
    # Filter to relative links only (skip external/banner links)
    valid = [l for l in links if l.get("href", "").startswith("/") and l.get_text(strip=True)]
    if not valid:
        return ["Drop", "Unknown", "unknown"]

    if len(valid) == 1:
        name = valid[0].get_text(strip=True)
        slug = valid[0]["href"].lstrip("/")
        return ["Drop", name, slug]

    result = ["Drop"]
    for link in valid:
        name = link.get_text(strip=True)
        slug = link["href"].lstrip("/")
        result.append([slug, name])
    return result


def _parse_merge(price_strong: Tag | None, page_content: Tag,
                 next_ul: Tag | None = None) -> list:
    """Parse a Merge price with shop name and ingredients."""
    shop_name = ""
    shop_slug = ""

    # Shop link: look in inline links after Price: or the Location field
    if price_strong:
        links = _get_sibling_links(price_strong)
        if links:
            shop_name = links[0].get_text(strip=True)
            shop_slug = links[0].get("href", "")

    # If no shop found inline, check the Location field
    if not shop_name:
        loc_strong = page_content.find("strong", string=re.compile(r"Locations?:"))
        if loc_strong:
            link = loc_strong.find_next("a")
            if link:
                shop_name = link.get_text(strip=True)
                shop_slug = link.get("href", "")

    # Parse ingredients from the <ul>
    ingredients = []
    ul = next_ul
    if ul:
        # The merge list is often nested: <ul><li>Merge the following:<ul><li>...</li></ul></li></ul>
        inner_ul = ul.find("ul")
        target = inner_ul if inner_ul else ul
        for li in target.find_all("li", recursive=False):
            link = li.find("a")
            if not link:
                continue
            ing_name = link.get_text(strip=True)
            ing_slug = link.get("href", "").lstrip("/")
            li_text = li.get_text(strip=True)
            qty_match = re.search(r"x\s*([\d,]+)", li_text)
            qty = qty_match.group(1) if qty_match else "1"
            ingredients.append([ing_name, ing_slug, qty])

    return ["Merge", shop_name, shop_slug, ingredients]


def _parse_quest_from_ul(next_ul: Tag | None, price_strong: Tag | None,
                         page_content: Tag) -> list:
    """Parse a Quest price from a <ul> containing 'Reward from' entries."""
    if next_ul:
        # Look for quest links in the <ul> (possibly nested)
        links = next_ul.find_all("a")
        for link in links:
            href = link.get("href", "")
            name = link.get_text(strip=True)
            if href.startswith("/") and name:
                slug = href.lstrip("/")
                return ["Quest", name, slug]

    return _parse_quest_inline(price_strong)


def _parse_quest_inline(price_strong: Tag | None) -> list:
    """Parse a Quest price from inline links near the <strong>."""
    if price_strong:
        links = _get_sibling_links(price_strong)
        for link in links:
            href = link.get("href", "")
            name = link.get_text(strip=True)
            if href.startswith("/") and name:
                slug = href.lstrip("/")
                return ["Quest", name, slug]
    return ["Quest", "Unknown", "unknown"]


def parse_sellback(sellback_strong: Tag | None, sellback_text: str,
                   page_content: Tag, next_ul: Tag | None = None) -> list | str:
    """Parse the Sellback field."""
    text = sellback_text.strip()

    # Simple inline: "X AC" or "X Gold"
    ac_match = re.match(r"^([\d,]+)\s*AC", text)
    if ac_match:
        return [ac_match.group(1), "AC"]

    gold_match = re.match(r"^([\d,]+)\s*Gold", text, re.IGNORECASE)
    if gold_match:
        return [gold_match.group(1), "GOLD"]

    # Tiered sellback: check the <ul> sibling (works even when text is empty)
    ul = next_ul
    if ul:
        tiers = _parse_tiered_sellback(ul)
        if tiers:
            return tiers

    # Also try find_next("ul") from the strong element
    if not ul and sellback_strong:
        ul = sellback_strong.find_next("ul")
        if ul:
            tiers = _parse_tiered_sellback(ul)
            if tiers:
                return tiers

    # Try to extract any number + currency from the raw text
    any_ac = re.search(r"([\d,]+)\s*AC", text)
    if any_ac:
        return [any_ac.group(1), "AC"]
    any_gold = re.search(r"([\d,]+)\s*Gold", text, re.IGNORECASE)
    if any_gold:
        return [any_gold.group(1), "GOLD"]

    if not text or text == "N/A":
        return "N/A"

    return ["0", "GOLD"]


def _parse_tiered_sellback(ul: Tag) -> list | None:
    """Parse tiered sellback from a <ul>.

    Returns the full tiered format matching the original JSON:
    ['First 24 Hours', ['amount', 'CURRENCY'], 'After 24 Hours', ['amount', 'CURRENCY']]
    """
    tiers = []
    for li in ul.find_all("li", recursive=False):
        text = li.get_text(strip=True)
        # Skip merge-related list items
        if "Merge" in text or "Reward" in text or "Dropped" in text:
            return None

        label = ""
        if "First 24" in text:
            label = "First 24 Hours"
        elif "After 24" in text:
            label = "After 24 Hours"
        elif "First" in text:
            label = "First24H"
        elif "After" in text or "after" in text:
            label = "After"

        ac_match = re.search(r"([\d,]+)\s*AC", text)
        gold_match = re.search(r"([\d,]+)\s*Gold", text, re.IGNORECASE)

        if ac_match:
            value = [ac_match.group(1), "AC"]
        elif gold_match:
            value = [gold_match.group(1), "GOLD"]
        else:
            continue

        if label:
            tiers.append(label)
            tiers.append(value)
        else:
            # Single-tier sellback, just return the value
            return value

    return tiers if len(tiers) >= 2 else None
