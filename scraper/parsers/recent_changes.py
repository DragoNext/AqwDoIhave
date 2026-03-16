import logging

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def parse_recent_changes(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    seen = {}

    for item in soup.select("tr"):
        title_td = item.select_one("td.title")
        if not title_td:
            continue

        link = title_td.select_one("a[href]")
        if not link:
            continue

        path = link.get("href", "")
        if not path.startswith("/"):
            continue

        change_type = "edit"
        flags_span = item.select_one("td.flags span.spantip")
        if flags_span:
            title_attr = flags_span.get("title", "")
            if "new" in title_attr.lower():
                change_type = "new"
            elif "rename" in title_attr.lower():
                change_type = "rename"

        date_td = item.select_one("td.mod-date")
        timestamp = date_td.get_text(strip=True) if date_td else ""

        if path not in seen:
            seen[path] = {
                "path": path,
                "change_type": change_type,
                "timestamp": timestamp,
            }

    results = list(seen.values())
    logger.info("Parsed %d unique changed pages", len(results))
    return results
