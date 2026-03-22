#!/usr/bin/env python3
"""Check which WikiItems.json slugs have images scraped vs missing."""
import argparse
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
IMAGES_DIR = BASE_DIR / "images"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="verify",
        description="Verify scraped images against WikiItems.json.",
    )
    parser.add_argument(
        "--wiki-items",
        required=True,
        help="Path to WikiItems.json.",
    )
    parser.add_argument(
        "--categories",
        default="all",
        help="Comma-separated categories to check (default: all).",
    )
    parser.add_argument(
        "--missing",
        action="store_true",
        help="Print missing slugs.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    with open(args.wiki_items) as f:
        data = json.load(f)

    cat_filter = None
    if args.categories.lower() != "all":
        cat_filter = {c.strip() for c in args.categories.split(",") if c.strip()}

    # Build set of expected slugs
    slugs: dict[str, str] = {}  # slug → category
    for name, entry in data.items():
        wiki_path = entry[0]
        category = entry[-1]
        if cat_filter and category not in cat_filter:
            continue
        slug = wiki_path.lstrip("/")
        slugs[slug] = category

    # Extract slugs from image filenames: {slug}.ext or {slug}_{variant}.ext
    found = set()
    if IMAGES_DIR.exists():
        for f in IMAGES_DIR.iterdir():
            if not f.is_file():
                continue
            stem = f.stem  # filename without extension
            # Strip variant suffix: slug_male, slug_female, slug_variant-1, etc.
            base = stem.split("_")[0] if "_" in stem else stem
            if base in slugs:
                found.add(base)

    missing = set(slugs) - found
    total = len(slugs)
    found_count = len(found)
    missing_count = len(missing)

    print(f"Scraped: {found_count} / {total}")
    print(f"Missing: {missing_count} / {total}")

    if cat_filter:
        # Per-category breakdown
        from collections import Counter
        found_cats = Counter(slugs[s] for s in found)
        total_cats = Counter(slugs.values())
        print()
        for cat in sorted(total_cats):
            print(f"  {cat}: {found_cats.get(cat, 0)} / {total_cats[cat]}")

    if args.missing and missing:
        print(f"\nMissing slugs ({missing_count}):")
        for slug in sorted(missing):
            print(f"  /{slug}  [{slugs[slug]}]")


if __name__ == "__main__":
    main()
