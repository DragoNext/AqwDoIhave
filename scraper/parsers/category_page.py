import logging
import re

from bs4 import BeautifulSoup

from ..models import CategoryItem
from .tag_parser import parse_index_tag_images

logger = logging.getLogger(__name__)


def get_max_page(html: str) -> int:
    """Detect the highest page number from pager elements on a category page."""
    soup = BeautifulSoup(html, "lxml")
    max_page = 1
    for pager_no in soup.select("span.pager-no"):
        m = re.search(r"page\s+\d+\s+of\s+(\d+)", pager_no.get_text(strip=True))
        if m:
            max_page = max(max_page, int(m.group(1)))
    return max_page


def parse_category_page(html: str, category: str) -> list[CategoryItem]:
    soup = BeautifulSoup(html, "lxml")
    items = []

    for box in soup.select("div.list-pages-box"):
        for entry in box.select("div.list-pages-item"):
            link = entry.select_one("p > a[href]")
            if not link:
                link = entry.select_one("a[href]")
            if not link:
                continue

            href = link.get("href", "")
            name = link.get_text(strip=True)
            if not href or not name:
                continue

            if not href.startswith("/"):
                href = "/" + href

            index_tags = parse_index_tag_images(entry)

            items.append(CategoryItem(
                name=name,
                wiki_path=href,
                index_tags=index_tags,
                category=category,
            ))

    logger.info("Parsed %d items from category '%s'", len(items), category)
    return items
