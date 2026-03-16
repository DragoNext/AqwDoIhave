import json
import logging
import os
from pathlib import Path

from .models import ItemDetail

logger = logging.getLogger(__name__)


def item_to_json_entry(item: ItemDetail) -> tuple[str, list]:
    return item.name, item.to_json_entry()


def load_existing_json(path: Path) -> dict:
    if not path.exists():
        logger.info("No existing WikiItems.json found at %s", path)
        return {}
    with open(path) as f:
        data = json.load(f)
    logger.info("Loaded %d existing items from %s", len(data), path)
    return data


def write_json(data: dict, path: Path):
    """Atomically write any JSON dict to a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        bak = path.with_suffix(".json.bak")
        os.replace(str(path), str(bak))
    tmp_path = path.with_suffix(".json.tmp")
    with open(tmp_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(str(tmp_path), str(path))
    logger.info("Wrote %d entries to %s", len(data), path)


def write_wiki_items_json(data: dict, path: Path, existing_count: int = 0):
    if existing_count > 0:
        drop = existing_count - len(data)
        if drop > existing_count * 0.01:
            logger.error(
                "Item count dropped by %d (%.1f%%) from %d to %d — aborting write",
                drop, drop / existing_count * 100, existing_count, len(data),
            )
            raise ValueError(f"Item count dropped too much: {existing_count} -> {len(data)}")

    bad = 0
    for name, entry in data.items():
        if not isinstance(entry, list) or len(entry) < 2:
            bad += 1
    if bad:
        logger.warning("%d items have malformed entries", bad)

    if path.exists():
        bak = path.with_suffix(".json.bak")
        os.replace(str(path), str(bak))
        logger.info("Backed up existing file to %s", bak)

    tmp_path = path.with_suffix(".json.tmp")
    with open(tmp_path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(str(tmp_path), str(path))
    logger.info("Wrote %d items to %s", len(data), path)
