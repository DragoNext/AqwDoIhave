#!/usr/bin/env python3
import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import aiohttp
from aiohttp_socks import ProxyConnector
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
IMGUR_HOSTS = {"i.imgur.com", "imgur.com"}
IMGUR_TEST_URL = "https://i.imgur.com/removed.png"


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


def _is_imgur_url(url: str) -> bool:
    return urlparse(url).hostname in IMGUR_HOSTS


class ProxyRotator:
    """Round-robin proxy rotator with per-proxy cooldown."""

    COOLDOWN = 5.0  # seconds before a cooled-down proxy re-enters the pool

    def __init__(self, proxies: list[tuple[str, float]]):
        self._proxies = [url for url, _ in proxies]
        self._index = 0
        self._lock = asyncio.Lock()
        # proxy_url → monotonic time when it's available again
        self._cooldowns: dict[str, float] = {}

    def __len__(self) -> int:
        return len(self._proxies)

    async def cooldown(self, proxy_url: str) -> None:
        """Put a proxy on cooldown (e.g. after a 429)."""
        async with self._lock:
            self._cooldowns[proxy_url] = time.monotonic() + self.COOLDOWN

    async def next(self) -> str:
        async with self._lock:
            now = time.monotonic()
            # Try each proxy once looking for one not on cooldown
            for _ in range(len(self._proxies)):
                proxy = self._proxies[self._index]
                self._index = (self._index + 1) % len(self._proxies)
                ready_at = self._cooldowns.get(proxy, 0)
                if now >= ready_at:
                    return proxy
            # All on cooldown — return the one that expires soonest
            soonest = min(self._proxies, key=lambda p: self._cooldowns.get(p, 0))
            wait = self._cooldowns.get(soonest, 0) - now
            if wait > 0:
                await asyncio.sleep(wait)
            return soonest


def load_proxies(raw: str) -> list[str]:
    """Parse proxy list from CLI value.

    Accepts comma-separated URLs or @filepath (one URL per line).
    """
    if raw.startswith("@"):
        path = Path(raw[1:])
        if not path.exists():
            raise FileNotFoundError(f"Proxy file not found: {path}")
        lines = path.read_text().splitlines()
    else:
        lines = raw.split(",")
    result = []
    for line in lines:
        line = line.split("#")[0].strip()
        if line:
            result.append(line)
    return result


def _needs_connector(proxy_url: str) -> bool:
    """SOCKS proxies need ProxyConnector; HTTP proxies use native aiohttp proxy= param."""
    return proxy_url.lower().startswith("socks")


async def _make_proxied_request(
    session: aiohttp.ClientSession,
    url: str,
    proxy_url: str,
) -> aiohttp.ClientResponse:
    """GET a URL through a proxy, handling both HTTP and SOCKS protocols."""
    if _needs_connector(proxy_url):
        connector = ProxyConnector.from_url(proxy_url)
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=session.timeout,
        ) as proxy_session:
            resp = await proxy_session.get(url)
            return resp
    else:
        return await session.get(url, proxy=proxy_url)


async def verify_proxies(proxies: list[str], timeout: float = 10.0) -> list[tuple[str, float]]:
    """Test each proxy against Imgur and return working ones sorted by latency."""
    results: list[tuple[str, float]] = []

    async def test_one(proxy_url: str) -> tuple[str, float] | None:
        t0 = time.monotonic()
        try:
            connector = ProxyConnector.from_url(proxy_url) if _needs_connector(proxy_url) else None
            async with aiohttp.ClientSession(
                connector=connector,
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as session:
                kwargs = {} if connector else {"proxy": proxy_url}
                async with session.get(IMGUR_TEST_URL, **kwargs) as resp:
                    await resp.read()
                    latency = (time.monotonic() - t0) * 1000
                    return proxy_url, latency
        except Exception as exc:
            logger.warning("Proxy failed: %s (%s)", proxy_url, exc)
            return None

    logger.info("Verifying %d proxies against Imgur...", len(proxies))
    tasks = [test_one(p) for p in proxies]
    for coro in asyncio.as_completed(tasks):
        result = await coro
        if result:
            results.append(result)

    results.sort(key=lambda r: r[1])
    for proxy_url, latency in results:
        logger.info("  OK %s (%.0fms)", proxy_url, latency)
    return results


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
    parser.add_argument(
        "--proxies",
        default="",
        help="Proxies for Imgur requests. Comma-separated URLs or @filepath (one per line). "
             "Supports http://, https://, socks5://. Verified and sorted by latency at startup.",
    )
    parser.add_argument(
        "--wiki-items",
        default="",
        help="Path to WikiItems.json to skip category crawling. "
             "Respects --categories to filter by category.",
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

    # Set up proxy rotator for Imgur requests
    proxy_rotator: ProxyRotator | None = None
    if args.proxies:
        raw_proxies = load_proxies(args.proxies)
        if not raw_proxies:
            logger.error("No proxies found in %s", args.proxies)
            return
        verified = await verify_proxies(raw_proxies)
        if not verified:
            logger.error("All %d proxies failed verification against Imgur", len(raw_proxies))
            return
        logger.info("%d/%d proxies passed verification", len(verified), len(raw_proxies))
        proxy_rotator = ProxyRotator(verified)

    logger.info("Starting embedding image scraper")
    if direct_slugs:
        logger.info("  Direct slugs: %d", len(direct_slugs))
    elif args.wiki_items:
        logger.info("  WikiItems.json: %s", args.wiki_items)
    else:
        logger.info("  Categories: %s", ", ".join(categories))
    logger.info("  Concurrency: %d, Delay: %.1fs", args.concurrency, args.delay)
    if proxy_rotator:
        logger.info("  Imgur proxies: %d", len(proxy_rotator))

    async with WikiClient(args.base_url, args.concurrency, args.delay) as client:
        if direct_slugs:
            items = [CategoryItem(name="", wiki_path=f"/{slug}") for slug in direct_slugs]
        elif args.wiki_items:
            items = load_wiki_items(args.wiki_items, categories if args.categories.lower() != "all" else [])
            logger.info("  Loaded %d items from WikiItems.json", len(items))
        else:
            items = await discover_items(client, categories, args)

        if args.limit > 0:
            items = items[: args.limit]

        records = await scrape_and_download_items(client, items, args, proxy_rotator)

    write_manifest(records)
    print(
        f"Done: {len(records)} items with saved images, manifest written to {MANIFEST_PATH}"
    )


def load_wiki_items(path: str, categories: list[str]) -> list[CategoryItem]:
    """Load items from WikiItems.json, optionally filtered by category."""
    import json as _json
    with open(path) as f:
        data = _json.load(f)
    items = []
    cat_set = set(categories) if categories else None
    for name, entry in data.items():
        wiki_path = entry[0]
        category = entry[-1]
        if cat_set and category not in cat_set:
            continue
        items.append(CategoryItem(name=name, wiki_path=wiki_path, category=category))
    return items


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


def _build_existing_slugs() -> set[str]:
    """Scan images/ once and return set of slugs that already have files."""
    slugs: set[str] = set()
    if not IMAGES_DIR.exists():
        return slugs
    for f in IMAGES_DIR.iterdir():
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS:
            stem = f.stem
            # Filenames: {slug}.ext or {slug}_{role}.ext
            # Slugs never contain underscores, so split on first _
            base = stem.split("_", 1)[0] if "_" in stem else stem
            slugs.add(base)
    return slugs


async def scrape_and_download_items(
    client: WikiClient,
    items: list[CategoryItem],
    args: argparse.Namespace,
    proxy_rotator: ProxyRotator | None = None,
) -> list[ItemRecord]:
    results: list[ItemRecord] = []

    # Filter out already-scraped items before starting
    if not args.force:
        existing = _build_existing_slugs()
        before = len(items)
        items = [i for i in items if i.wiki_path.lstrip("/") not in existing]
        skipped = before - len(items)
        if skipped:
            logger.info("Skipping %d items with existing images, %d remaining", skipped, len(items))

    if not items:
        logger.info("All items already scraped")
        return results

    bar = tqdm(total=len(items), desc="Items", unit="item")
    sem = asyncio.Semaphore(args.concurrency)

    async def scrape_one(item: CategoryItem) -> ItemRecord | None:
        async with sem:
            try:
                html, final_path = await client.fetch_page(item.wiki_path, track_redirect=True)
                detail = parse_item_page(html, final_path, item.category, item.name)
                record = await download_item_variants(
                    client, detail, force=args.force, proxy_rotator=proxy_rotator,
                )
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
    proxy_rotator: ProxyRotator | None = None,
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
            payload = await fetch_binary(client, source_url, proxy_rotator=proxy_rotator)
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


async def _proxied_get(
    client: WikiClient,
    source_url: str,
    proxy: str | None,
) -> bytes:
    """GET binary through an optional proxy. Raises on error status."""
    if proxy and _needs_connector(proxy):
        connector = ProxyConnector.from_url(proxy)
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=client._session.timeout,
        ) as proxy_session:
            async with proxy_session.get(source_url) as resp:
                if resp.status == 429:
                    raise _RateLimited(proxy)
                if 400 <= resp.status < 500:
                    resp.raise_for_status()
                if resp.status >= 500:
                    raise RuntimeError(f"Server error {resp.status} for {source_url}")
                return await resp.read()
    else:
        async with client._session.get(source_url, proxy=proxy) as resp:
            if resp.status == 429:
                raise _RateLimited(proxy)
            if 400 <= resp.status < 500:
                resp.raise_for_status()
            if resp.status >= 500:
                raise RuntimeError(f"Server error {resp.status} for {source_url}")
            return await resp.read()


class _RateLimited(Exception):
    """Raised on 429 so fetch_binary can cooldown the proxy and instantly retry."""
    def __init__(self, proxy: str | None):
        self.proxy = proxy
        super().__init__(f"429 rate limited via {proxy}")


async def fetch_binary(
    client: WikiClient,
    source_url: str,
    *,
    proxy_rotator: ProxyRotator | None = None,
) -> bytes:
    use_proxy = proxy_rotator is not None and _is_imgur_url(source_url)
    last_exc: Exception | None = None
    for attempt in range(client.max_retries):
        proxy = await proxy_rotator.next() if use_proxy else None
        async with client._semaphore:
            try:
                assert client._session is not None
                payload = await _proxied_get(client, source_url, proxy)
                await asyncio.sleep(client.delay)
                return payload
            except _RateLimited as exc:
                # Cooldown this proxy and instantly retry with a different one
                if proxy and proxy_rotator:
                    await proxy_rotator.cooldown(proxy)
                    logger.info("429 on %s — cooling down proxy, retrying instantly", proxy)
                    continue
                last_exc = exc
            except Exception as exc:
                last_exc = exc
                wait = 1.0 + attempt
                logger.warning(
                    "Retry %d/%d for %s%s: %s (wait %.0fs)",
                    attempt + 1,
                    client.max_retries,
                    source_url,
                    f" via {proxy}" if proxy else "",
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
