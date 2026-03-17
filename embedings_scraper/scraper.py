#!/usr/bin/env python3
import argparse
import asyncio
import json
import logging
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

from tqdm import tqdm

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scraper.config import ALL_CATEGORIES
from scraper.models import CategoryItem, ItemDetail
from scraper.parsers.category_page import get_max_page, parse_category_page
from scraper.parsers.item_page import parse_item_page
from scraper.wiki_client import WikiClient


BASE_DIR = Path(__file__).resolve().parent
IMAGES_DIR = BASE_DIR / "images"
MANIFEST_PATH = BASE_DIR / "manifest.json"

logger = logging.getLogger("embedings_scraper")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
GENDERED_CATEGORIES = {"armors", "classes"}


@dataclass
class VariantRecord:
    role: str
    source_url: str
    local_path: str


@dataclass
class ItemRecord:
    slug: str
    wiki_path: str
    name: str
    category: str
    variants: list[VariantRecord]
    image_count: int


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="embedings_scraper",
        description="Download AQW wiki item images for later embedding/indexing work.",
    )
    parser.add_argument(
        "--categories",
        default="all",
        help="Comma-separated categories to scrape. Default: all item categories.",
    )
    parser.add_argument(
        "--slugs",
        default="",
        help="Optional comma-separated item slugs to scrape directly instead of category crawling.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Max concurrent wiki/image requests.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.2,
        help="Delay between requests in seconds.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional item limit after discovery, useful for testing.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Redownload files even if they already exist locally.",
    )
    parser.add_argument(
        "--base-url",
        default="https://aqwwiki.wikidot.com",
        help="AQW wiki base URL.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    asyncio.run(run(args))


async def run(args: argparse.Namespace) -> None:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    categories = list(ALL_CATEGORIES)
    if args.categories and args.categories.lower() != "all":
        categories = [part.strip() for part in args.categories.split(",") if part.strip()]

    direct_slugs = [normalize_slug(part) for part in args.slugs.split(",") if part.strip()]

    logger.info("Starting embedding image scraper")
    if direct_slugs:
        logger.info("  Direct slugs: %d", len(direct_slugs))
    else:
        logger.info("  Categories: %s", ", ".join(categories))
    logger.info("  Concurrency: %d, Delay: %.1fs", args.concurrency, args.delay)

    async with WikiClient(args.base_url, args.concurrency, args.delay) as client:
        if direct_slugs:
            items = [CategoryItem(name="", wiki_path=f"/{slug}") for slug in direct_slugs]
        else:
            items = await discover_items(client, categories, args)

        if args.limit > 0:
            items = items[: args.limit]

        records = await scrape_and_download_items(client, items, args)

    write_manifest(records)
    print(
        f"Done: {len(records)} items with saved images, manifest written to {MANIFEST_PATH}"
    )


def normalize_slug(value: str) -> str:
    return value.strip().lstrip("/")


async def discover_items(
    client: WikiClient,
    categories: list[str],
    args: argparse.Namespace,
) -> list[CategoryItem]:
    discovered: list[CategoryItem] = []
    seen_paths: set[str] = set()
    category_bar = tqdm(categories, desc="Categories", unit="cat")

    for category in category_bar:
        category_bar.set_postfix_str(category)
        for item in await crawl_category(client, category, args):
            if item.wiki_path in seen_paths:
                continue
            seen_paths.add(item.wiki_path)
            discovered.append(item)

    category_bar.close()
    return discovered


async def crawl_category(
    client: WikiClient,
    category: str,
    args: argparse.Namespace,
) -> list[CategoryItem]:
    html = await client.fetch_page(f"/{category}")
    items = parse_category_page(html, category)
    seen_paths = {item.wiki_path for item in items}
    max_page = get_max_page(html)

    if max_page <= 1:
        return items

    sem = asyncio.Semaphore(args.concurrency)

    async def fetch_page(page_num: int) -> list[CategoryItem]:
        async with sem:
            page_html = await client.fetch_page(f"/{category}/p/{page_num}")
            return parse_category_page(page_html, category)

    page_bar = tqdm(
        total=max_page - 1,
        desc=f"  {category} pages",
        unit="pg",
        leave=False,
    )
    tasks = [fetch_page(page_num) for page_num in range(2, max_page + 1)]
    for coro in asyncio.as_completed(tasks):
        try:
            page_items = await coro
            for item in page_items:
                if item.wiki_path in seen_paths:
                    continue
                seen_paths.add(item.wiki_path)
                items.append(item)
        finally:
            page_bar.update(1)
    page_bar.close()
    return items


async def scrape_and_download_items(
    client: WikiClient,
    items: list[CategoryItem],
    args: argparse.Namespace,
) -> list[ItemRecord]:
    results: list[ItemRecord] = []
    bar = tqdm(total=len(items), desc="Items", unit="item")
    sem = asyncio.Semaphore(args.concurrency)

    async def scrape_one(item: CategoryItem) -> ItemRecord | None:
        async with sem:
            try:
                html = await client.fetch_page(item.wiki_path)
                detail = parse_item_page(html, item.wiki_path, item.category, item.name)
                record = await download_item_variants(client, detail, force=args.force)
                return record
            except Exception as exc:
                logger.warning("Failed %s: %s", item.wiki_path, exc)
                return None
            finally:
                bar.update(1)

    tasks = [scrape_one(item) for item in items]
    for coro in asyncio.as_completed(tasks):
        record = await coro
        if record:
            results.append(record)

    bar.close()
    results.sort(key=lambda record: record.slug)
    return results


async def download_item_variants(
    client: WikiClient,
    detail: ItemDetail,
    *,
    force: bool,
) -> ItemRecord | None:
    source_urls = unique_preserve_order(detail.image_urls)
    if not source_urls:
        return None

    slug = detail.wiki_path.lstrip("/")
    variant_specs = build_variant_specs(detail, source_urls)
    saved_variants: list[VariantRecord] = []

    for role, source_url in variant_specs:
        file_path = build_target_path(slug, role, source_url)
        if force or not file_path.exists():
            payload = await fetch_binary(client, source_url)
            file_path.write_bytes(payload)
        saved_variants.append(
            VariantRecord(
                role=role,
                source_url=source_url,
                local_path=str(file_path.relative_to(BASE_DIR)),
            )
        )

    return ItemRecord(
        slug=slug,
        wiki_path=detail.wiki_path,
        name=detail.name,
        category=detail.category,
        variants=saved_variants,
        image_count=len(saved_variants),
    )


def build_variant_specs(detail: ItemDetail, source_urls: list[str]) -> list[tuple[str, str]]:
    normalized = [normalize_image_url(url) for url in source_urls]
    if len(normalized) == 1:
        return [("main", normalized[0])]
    if detail.category in GENDERED_CATEGORIES and len(normalized) >= 2:
        specs = [("male", normalized[0]), ("female", normalized[1])]
        for index, source_url in enumerate(normalized[2:], start=3):
            specs.append((f"variant-{index}", source_url))
        return specs
    return [(f"variant-{index}", source_url) for index, source_url in enumerate(normalized, start=1)]


def normalize_image_url(url: str) -> str:
    if url.startswith("//"):
        return f"https:{url}"
    if url.startswith("/"):
        return urljoin("https://aqwwiki.wikidot.com", url)
    return url


def build_target_path(slug: str, role: str, source_url: str) -> Path:
    suffix = Path(urlparse(source_url).path).suffix.lower()
    if suffix not in IMAGE_EXTENSIONS:
        suffix = ".png"
    if role == "main":
        return IMAGES_DIR / f"{slug}{suffix}"
    return IMAGES_DIR / f"{slug}_{role}{suffix}"


async def fetch_binary(client: WikiClient, source_url: str) -> bytes:
    last_exc: Exception | None = None
    for attempt in range(client.max_retries):
        async with client._semaphore:
            try:
                assert client._session is not None
                async with client._session.get(source_url) as resp:
                    if 400 <= resp.status < 500:
                        resp.raise_for_status()
                    if resp.status >= 500:
                        raise RuntimeError(f"Server error {resp.status} for {source_url}")
                    payload = await resp.read()
                await asyncio.sleep(client.delay)
                return payload
            except Exception as exc:
                last_exc = exc
                wait = 1.0 + attempt
                logger.warning(
                    "Retry %d/%d for %s: %s (wait %.0fs)",
                    attempt + 1,
                    client.max_retries,
                    source_url,
                    exc,
                    wait,
                )
                await asyncio.sleep(wait)
    assert last_exc is not None
    raise last_exc


def unique_preserve_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def write_manifest(records: list[ItemRecord]) -> None:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "items": [asdict(record) for record in records],
    }
    MANIFEST_PATH.write_text(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
