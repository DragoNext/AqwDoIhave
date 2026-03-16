import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path

from tqdm import tqdm

from .blacklist import Blacklist
from .config import ScraperConfig
from .models import ItemDetail
from .output import load_existing_json, write_json, write_wiki_items_json
from .parsers.category_page import parse_category_page, get_max_page
from .parsers.index_page import parse_index_page
from .parsers.item_page import parse_item_page
from .parsers.location_page import parse_location_page
from .parsers.merge_shop_page import parse_merge_shop_page
from .parsers.npc_page import parse_npc_page
from .parsers.quest_page import parse_quest_page
from .parsers.recent_changes import parse_recent_changes
from .state import ScrapeState
from .wiki_client import WikiClient

logger = logging.getLogger(__name__)


async def run_full_scrape(config: ScraperConfig):
    blacklist = Blacklist(config.blacklist_path)
    existing = {}
    existing_count = 0

    state = ScrapeState(config.state_path, config.checkpoint_interval)
    if config.resume:
        state.load()

    total_new = 0
    total_failed = 0
    log_entries = []

    cats_to_do = [c for c in config.categories if not state.is_category_done(c)]
    cat_bar = tqdm(cats_to_do, desc="Categories", unit="cat", position=0)

    async with WikiClient(config.base_url, config.concurrency, config.delay) as client:
        for category in cat_bar:
            cat_bar.set_postfix_str(category)

            try:
                html = await client.fetch_page(f"/{category}")
            except Exception as e:
                logger.error("Failed to fetch category %s: %s", category, e)
                log_entries.append({"category": category, "error": str(e)})
                continue

            cat_items = parse_category_page(html, category)

            # Handle paginated category pages — fetch remaining pages concurrently
            max_page = get_max_page(html)
            if max_page > 1:
                sem = asyncio.Semaphore(config.concurrency)

                async def _fetch_cat_page(page_num):
                    async with sem:
                        page_html = await client.fetch_page(f"/{category}/p/{page_num}")
                        return parse_category_page(page_html, category)

                page_bar = tqdm(total=max_page - 1, desc=f"  {category} pages",
                                unit="pg", position=1, leave=False)
                tasks = [_fetch_cat_page(p) for p in range(2, max_page + 1)]
                seen_paths = {ci.wiki_path for ci in cat_items}
                for coro in asyncio.as_completed(tasks):
                    try:
                        page_items = await coro
                        for ci in page_items:
                            if ci.wiki_path not in seen_paths:
                                seen_paths.add(ci.wiki_path)
                                cat_items.append(ci)
                    except Exception as e:
                        logger.warning("Failed to fetch %s page: %s", category, e)
                    page_bar.update(1)
                page_bar.close()

            to_scrape = []
            for ci in cat_items:
                if blacklist.is_blocked(ci.wiki_path.lstrip("/"), ci.name, category):
                    continue
                if state.is_item_done(ci.wiki_path):
                    continue
                to_scrape.append(ci)

            if config.dry_run:
                tqdm.write(f"DRY RUN [{category}]: {len(to_scrape)} to scrape")
                state.mark_category_done(category)
                continue

            if not to_scrape:
                state.mark_category_done(category)
                continue

            item_bar = tqdm(total=len(to_scrape), desc=f"  {category}",
                            unit="item", position=1, leave=False)

            sem = asyncio.Semaphore(config.concurrency)

            async def _scrape_one(ci):
                async with sem:
                    result = await _scrape_item(client, ci.wiki_path, category, ci.name)
                    item_bar.update(1)
                    return ci, result

            tasks = [_scrape_one(ci) for ci in to_scrape]

            # Process results as they complete instead of waiting for all
            for coro in asyncio.as_completed(tasks):
                r = await coro
                if isinstance(r, Exception):
                    total_failed += 1
                    continue
                ci, result = r
                if isinstance(result, Exception) or result is None:
                    state.mark_item_failed(ci.wiki_path, str(result))
                    total_failed += 1
                    log_entries.append({
                        "item": ci.name, "path": ci.wiki_path,
                        "category": category, "error": str(result),
                    })
                else:
                    name, entry = result.name, result.to_json_entry()
                    state.mark_item_done(ci.wiki_path, [name, entry])
                    total_new += 1
                    existing[name] = entry

            item_bar.close()
            state.mark_category_done(category)
            cat_bar.set_postfix(scraped=total_new, fail=total_failed)

    cat_bar.close()

    for wiki_path, (name, entry) in state.scraped_items.items():
        if name not in existing:
            existing[name] = entry

    if not config.dry_run:
        write_wiki_items_json(existing, config.output_path, existing_count)
        state.clear()

    _write_log(config.log_path, {
        "mode": "full",
        "categories": config.categories,
        "scraped": total_new,
        "failed": total_failed,
        "total_items": len(existing),
        "entries": log_entries,
    })

    print(f"\nDone: {total_new} scraped, {total_failed} failed, {len(existing)} total")

    # Also scrape merge shops, quests, locations, NPCs
    await run_merge_shops_scrape(config)
    await run_quests_scrape(config)
    await run_locations_scrape(config)
    await run_npcs_scrape(config)


async def run_recent_scrape(config: ScraperConfig):
    blacklist = Blacklist(config.blacklist_path)
    existing = load_existing_json(config.output_path)
    existing_count = len(existing)

    path_to_name = {}
    for name, entry in existing.items():
        if isinstance(entry, list) and len(entry) >= 1:
            path_to_name[entry[0]] = name

    total_updated = 0
    total_new = 0
    log_entries = []

    async with WikiClient(config.base_url, config.concurrency, config.delay) as client:
        all_changes = []
        for page_num in tqdm(range(1, config.recent_pages + 1),
                             desc="Fetching recent changes", unit="page"):
            try:
                resp = await client.fetch_ajax(
                    "changes/SiteChangesModule",
                    {"currentPage": str(page_num), "perPage": "100"},
                )
                body = resp.get("body", "")
                changes = parse_recent_changes(body)
                all_changes.extend(changes)
            except Exception as e:
                logger.error("Failed to fetch recent changes page %d: %s", page_num, e)
                break

        seen_paths = {}
        for change in all_changes:
            path = change["path"]
            if path not in seen_paths:
                seen_paths[path] = change

        item_changes = []
        for path, change in seen_paths.items():
            slug = path.lstrip("/")
            if blacklist.is_blocked(slug):
                continue
            item_changes.append(change)

        print(f"Found {len(item_changes)} unique changed pages to check")

        if config.dry_run:
            for change in item_changes[:20]:
                status = "UPDATE" if change["path"] in path_to_name else "NEW?"
                print(f"  {status}: {change['path']} ({change['change_type']})")
            if len(item_changes) > 20:
                print(f"  ... and {len(item_changes) - 20} more")
            return

        item_bar = tqdm(total=len(item_changes), desc="Scraping items", unit="item")

        sem = asyncio.Semaphore(config.concurrency)

        async def _scrape_one(change):
            async with sem:
                old_name = path_to_name.get(change["path"])
                category = ""
                if old_name and old_name in existing:
                    entry = existing[old_name]
                    if isinstance(entry, list) and len(entry) >= 15:
                        category = entry[14]
                result = await _scrape_item(client, change["path"], category, old_name or "")
                item_bar.update(1)
                return change, result

        tasks = [_scrape_one(change) for change in item_changes]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in results:
            if isinstance(r, Exception):
                continue
            change, result = r
            if isinstance(result, Exception) or result is None:
                log_entries.append({"path": change["path"], "error": str(result)})
            else:
                name = result.name
                entry = result.to_json_entry()
                old_name = path_to_name.get(change["path"])
                if old_name and old_name != name and old_name in existing:
                    del existing[old_name]
                existing[name] = entry
                if change["path"] in path_to_name:
                    total_updated += 1
                else:
                    total_new += 1

        item_bar.close()
        write_wiki_items_json(existing, config.output_path, existing_count)

    _write_log(config.log_path, {
        "mode": "recent",
        "pages_checked": config.recent_pages,
        "changes_found": len(item_changes),
        "new_items": total_new,
        "updated_items": total_updated,
        "total_items": len(existing),
        "entries": log_entries,
    })

    print(f"\nDone: {total_new} new, {total_updated} updated, {len(existing)} total")


async def _scrape_item(client: WikiClient, wiki_path: str, category: str,
                       name: str) -> ItemDetail | None:
    html = await client.fetch_page(wiki_path)
    return parse_item_page(html, wiki_path, category, name)


async def _crawl_index_pages(client: WikiClient, base_url: str, config: ScraperConfig) -> list[dict]:
    """Fetch index pages with auto-pagination, deduplicating by slug."""
    all_entries = []
    seen = set()

    # Fetch page 1
    html = await client.fetch_page(base_url)
    entries = parse_index_page(html)
    for e in entries:
        if e["slug"] not in seen:
            seen.add(e["slug"])
            all_entries.append(e)

    max_page = get_max_page(html)
    if max_page > 1:
        sem = asyncio.Semaphore(config.concurrency)

        async def _fetch_page(p):
            async with sem:
                h = await client.fetch_page(f"{base_url}/p/{p}")
                return parse_index_page(h)

        bar = tqdm(total=max_page - 1, desc=f"  {base_url} pages", unit="pg", leave=False)
        tasks = [_fetch_page(p) for p in range(2, max_page + 1)]
        for coro in asyncio.as_completed(tasks):
            try:
                page_entries = await coro
                for e in page_entries:
                    if e["slug"] not in seen:
                        seen.add(e["slug"])
                        all_entries.append(e)
            except Exception as exc:
                logger.warning("Failed to fetch %s page: %s", base_url, exc)
            bar.update(1)
        bar.close()

    logger.info("Found %d unique entries across %d pages of %s", len(all_entries), max_page, base_url)
    return all_entries


async def _scrape_pages_generic(client: WikiClient, entries: list[dict],
                                parse_fn, config: ScraperConfig,
                                state: ScrapeState, label: str) -> dict:
    """Generic scraper: fetch each slug, parse with parse_fn, collect results."""
    to_scrape = [e for e in entries if not state.is_item_done(e["slug"])]

    if config.dry_run:
        print(f"DRY RUN [{label}]: {len(to_scrape)} pages to scrape")
        for e in to_scrape[:15]:
            print(f"  {e['name']} ({e['slug']})")
        if len(to_scrape) > 15:
            print(f"  ... and {len(to_scrape) - 15} more")
        return {}

    if not to_scrape:
        print(f"[{label}] Nothing new to scrape")
        return {}

    results = {}
    failed = 0
    bar = tqdm(total=len(to_scrape), desc=label, unit="page")
    sem = asyncio.Semaphore(config.concurrency)

    async def _do_one(entry):
        async with sem:
            try:
                html = await client.fetch_page(entry["slug"])
                parsed = parse_fn(html, entry["slug"], entry["name"])
                bar.update(1)
                return entry, parsed
            except Exception as exc:
                bar.update(1)
                return entry, exc

    tasks = [_do_one(e) for e in to_scrape]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in raw_results:
        if isinstance(r, Exception):
            failed += 1
            continue
        entry, parsed = r
        if isinstance(parsed, Exception) or parsed is None:
            state.mark_item_failed(entry["slug"], str(parsed))
            failed += 1
        else:
            key = parsed.get("name", entry["name"])
            results[key] = parsed
            state.mark_item_done(entry["slug"], key)

    bar.close()
    print(f"[{label}] Scraped {len(results)}, failed {failed}")
    return results


async def run_merge_shops_scrape(config: ScraperConfig):
    """Scrape all merge shops."""
    state = ScrapeState(config.state_path.with_name("state_merge_shops.json"),
                        config.checkpoint_interval)
    if config.resume:
        state.load()

    output_path = config.output_path.parent / "merge_shops.json"

    async with WikiClient(config.base_url, config.concurrency, config.delay) as client:
        entries = await _crawl_index_pages(client, "/merge-shops", config)
        results = await _scrape_pages_generic(
            client, entries, parse_merge_shop_page, config, state, "Merge Shops")

    if results and not config.dry_run:
        write_json(results, output_path)
        state.clear()

    _write_log(config.log_path, {"mode": "merge-shops", "scraped": len(results)})


async def run_quests_scrape(config: ScraperConfig):
    """Scrape all quest pages."""
    state = ScrapeState(config.state_path.with_name("state_quests.json"),
                        config.checkpoint_interval)
    if config.resume:
        state.load()

    output_path = config.output_path.parent / "quests.json"

    async with WikiClient(config.base_url, config.concurrency, config.delay) as client:
        entries = await _crawl_index_pages(client, "/sort-by-all-quests", config)
        results = await _scrape_pages_generic(
            client, entries, parse_quest_page, config, state, "Quests")

    if results and not config.dry_run:
        write_json(results, output_path)
        state.clear()

    _write_log(config.log_path, {"mode": "quests", "scraped": len(results)})


async def run_locations_scrape(config: ScraperConfig):
    """Scrape all location pages."""
    state = ScrapeState(config.state_path.with_name("state_locations.json"),
                        config.checkpoint_interval)
    if config.resume:
        state.load()

    output_path = config.output_path.parent / "locations.json"

    async with WikiClient(config.base_url, config.concurrency, config.delay) as client:
        entries = await _crawl_index_pages(client, "/locations", config)
        results = await _scrape_pages_generic(
            client, entries, parse_location_page, config, state, "Locations")

    if results and not config.dry_run:
        write_json(results, output_path)
        state.clear()

    _write_log(config.log_path, {"mode": "locations", "scraped": len(results)})


async def run_npcs_scrape(config: ScraperConfig):
    """Scrape all NPC pages."""
    state = ScrapeState(config.state_path.with_name("state_npcs.json"),
                        config.checkpoint_interval)
    if config.resume:
        state.load()

    output_path = config.output_path.parent / "npcs.json"

    async with WikiClient(config.base_url, config.concurrency, config.delay) as client:
        entries = await _crawl_index_pages(client, "/npcs", config)
        results = await _scrape_pages_generic(
            client, entries, parse_npc_page, config, state, "NPCs")

    if results and not config.dry_run:
        write_json(results, output_path)
        state.clear()

    _write_log(config.log_path, {"mode": "npcs", "scraped": len(results)})


def _write_log(path: Path, data: dict):
    data["timestamp"] = datetime.now().isoformat()
    with open(path, "a") as f:
        f.write(json.dumps(data) + "\n")
