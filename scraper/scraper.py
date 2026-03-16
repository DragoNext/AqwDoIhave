#!/usr/bin/env python3
"""
AQW Wiki Scraper — standalone entry point.
Usage: cd scraper/ && python scraper.py [args]
"""
import asyncio
import logging
import sys
from pathlib import Path

# Make sure imports work when running as a plain script from scraper/ dir
sys.path.insert(0, str(Path(__file__).parent.parent))

from scraper.config import parse_args
from scraper.pipeline import (
    run_full_scrape,
    run_locations_scrape,
    run_merge_shops_scrape,
    run_npcs_scrape,
    run_quests_scrape,
    run_recent_scrape,
)

RUNNERS = {
    "full": run_full_scrape,
    "recent": run_recent_scrape,
    "merge-shops": run_merge_shops_scrape,
    "quests": run_quests_scrape,
    "locations": run_locations_scrape,
    "npcs": run_npcs_scrape,
}


def main():
    config = parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    logger = logging.getLogger("scraper")
    logger.info("Starting scraper in '%s' mode", config.mode)
    logger.info("  Concurrency: %d, Delay: %.1fs", config.concurrency, config.delay)
    if config.resume:
        logger.info("  Resume mode enabled")
    if config.dry_run:
        logger.info("  DRY RUN — no output will be written")

    if config.mode == "all":
        for mode_name, runner in RUNNERS.items():
            if mode_name == "recent":
                continue
            logger.info("=== Running %s ===", mode_name)
            asyncio.run(runner(config))
    elif config.mode in RUNNERS:
        asyncio.run(RUNNERS[config.mode](config))
    else:
        logger.error("Unknown mode: %s", config.mode)
        sys.exit(1)


if __name__ == "__main__":
    main()
