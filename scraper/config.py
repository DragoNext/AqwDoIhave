import argparse
from dataclasses import dataclass, field
from pathlib import Path


ALL_CATEGORIES = [
    "armors", "helmets-hoods", "capes-back-items", "swords", "daggers",
    "maces", "polearms", "staffs", "axes", "guns", "bows", "gauntlets",
    "wands", "whips", "handguns", "rifles", "pets", "battle-pets",
    "misc-items", "necklaces", "classes", "houses", "floor-items",
    "wall-items", "grounds",
]

BASE_DIR = Path(__file__).parent


@dataclass
class ScraperConfig:
    mode: str = "full"  # "full" or "recent"
    concurrency: int = 10
    delay: float = 0.2
    base_url: str = "https://aqwwiki.wikidot.com"
    output_path: Path = field(default_factory=lambda: BASE_DIR / "data" / "WikiItems.json")
    state_path: Path = field(default_factory=lambda: BASE_DIR / "data" / "state.json")
    blacklist_path: Path = field(default_factory=lambda: BASE_DIR / "data" / "blacklist.json")
    log_path: Path = field(default_factory=lambda: BASE_DIR / "data" / "scrape_log.jsonl")
    categories: list[str] = field(default_factory=lambda: list(ALL_CATEGORIES))
    resume: bool = False
    dry_run: bool = False
    recent_pages: int = 10
    checkpoint_interval: int = 500


def parse_args(argv: list[str] | None = None) -> ScraperConfig:
    parser = argparse.ArgumentParser(
        prog="scraper",
        description="AQW Wiki item scraper",
    )
    ALL_MODES = ["full", "recent", "merge-shops", "quests", "locations", "npcs", "all"]
    parser.add_argument(
        "--mode", choices=ALL_MODES, default="full",
        help="Scrape mode: full, recent, merge-shops, quests, locations, npcs, or all",
    )
    parser.add_argument(
        "--concurrency", type=int, default=5,
        help="Max concurrent requests (default: 5)",
    )
    parser.add_argument(
        "--delay", type=float, default=0.2,
        help="Delay between requests in seconds (default: 0.2)",
    )
    parser.add_argument(
        "--categories", type=str, default=None,
        help="Comma-separated categories to scrape (default: all)",
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Resume an interrupted scrape from checkpoint",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report what would be scraped without writing output",
    )
    parser.add_argument(
        "--pages", type=int, default=10,
        help="Number of recent-changes pages to fetch (recent mode, default: 10)",
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output path for WikiItems.json",
    )

    args = parser.parse_args(argv)
    config = ScraperConfig(
        mode=args.mode,
        concurrency=args.concurrency,
        delay=args.delay,
        resume=args.resume,
        dry_run=args.dry_run,
        recent_pages=args.pages,
    )
    if args.categories:
        config.categories = [c.strip() for c in args.categories.split(",")]
    if args.output:
        config.output_path = Path(args.output)
    return config
