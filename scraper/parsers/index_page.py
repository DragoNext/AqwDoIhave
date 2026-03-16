import logging

from bs4 import BeautifulSoup

from .tag_parser import parse_index_tag_images

logger = logging.getLogger(__name__)


def parse_index_page(html: str) -> list[dict]:
    """Parse an index listing page (merge-shops, quests, npcs, locations, shops).

    Works with both alphabetical list-pages-item pages and flat sort-by-all pages.
    Returns list of {"name": str, "slug": str, "tags": list[str]}.
    """
    soup = BeautifulSoup(html, "lxml")
    items = []
    seen = set()

    # Alphabetical pages: div.list-pages-item entries
    for entry in soup.select("div.list-pages-item"):
        link = entry.select_one("a[href]")
        if not link:
            continue
        href = link.get("href", "")
        name = link.get_text(strip=True)
        if not href or not name:
            continue
        if not href.startswith("/"):
            href = "/" + href
        if href in seen:
            continue
        seen.add(href)
        tags = parse_index_tag_images(entry)
        items.append({"name": name, "slug": href, "tags": tags})

    # Flat sort-by-all pages: links inside list-pages-box but no list-pages-item wrappers
    if not items:
        for box in soup.select("div.list-pages-box"):
            for link in box.find_all("a", href=True):
                href = link.get("href", "")
                name = link.get_text(strip=True)
                if not href or not name:
                    continue
                if not href.startswith("/"):
                    href = "/" + href
                if href in seen:
                    continue
                seen.add(href)
                items.append({"name": name, "slug": href, "tags": []})

    logger.info("Parsed %d entries from index page", len(items))
    return items
