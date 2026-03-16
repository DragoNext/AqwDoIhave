import asyncio
import logging
import sys

from .config import parse_args
from .pipeline import run_full_scrape, run_recent_scrape


def main():
    config = parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    logger = logging.getLogger("scraper")
    logger.info("Starting scraper in '%s' mode", config.mode)
    logger.info("  Categories: %s", ", ".join(config.categories))
    logger.info("  Concurrency: %d, Delay: %.1fs", config.concurrency, config.delay)
    logger.info("  Output: %s", config.output_path)
    if config.resume:
        logger.info("  Resume mode enabled")
    if config.dry_run:
        logger.info("  DRY RUN — no output will be written")

    if config.mode == "full":
        asyncio.run(run_full_scrape(config))
    elif config.mode == "recent":
        asyncio.run(run_recent_scrape(config))
    else:
        logger.error("Unknown mode: %s", config.mode)
        sys.exit(1)


if __name__ == "__main__":
    main()
