import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class ScrapeState:
    def __init__(self, path: Path, checkpoint_interval: int = 10):
        self.path = path
        self.checkpoint_interval = checkpoint_interval
        self.completed_categories: set[str] = set()
        self.scraped_items: dict[str, list] = {}
        self.failed_items: dict[str, str] = {}
        self._items_since_checkpoint = 0

    def load(self) -> bool:
        if not self.path.exists():
            return False
        try:
            data = json.loads(self.path.read_text())
            self.completed_categories = set(data.get("completed_categories", []))
            self.scraped_items = data.get("scraped_items", {})
            self.failed_items = data.get("failed_items", {})
            logger.info("Resumed state: %d categories done, %d items scraped, %d failed",
                        len(self.completed_categories), len(self.scraped_items),
                        len(self.failed_items))
            return True
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning("Failed to load state: %s", e)
            return False

    def save(self):
        data = {
            "completed_categories": sorted(self.completed_categories),
            "scraped_items": self.scraped_items,
            "failed_items": self.failed_items,
        }
        tmp_path = self.path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(data, indent=2))
        os.replace(str(tmp_path), str(self.path))

    def is_category_done(self, category: str) -> bool:
        return category in self.completed_categories

    def mark_category_done(self, category: str):
        self.completed_categories.add(category)
        self.save()

    def is_item_done(self, wiki_path: str) -> bool:
        return wiki_path in self.scraped_items

    def mark_item_done(self, wiki_path: str, json_entry: list):
        self.scraped_items[wiki_path] = json_entry
        self._items_since_checkpoint += 1
        if self._items_since_checkpoint >= self.checkpoint_interval:
            self.save()
            self._items_since_checkpoint = 0

    def mark_item_failed(self, wiki_path: str, error: str):
        self.failed_items[wiki_path] = error
        self._items_since_checkpoint += 1
        if self._items_since_checkpoint >= self.checkpoint_interval:
            self.save()
            self._items_since_checkpoint = 0

    def clear(self):
        if self.path.exists():
            self.path.unlink()
            logger.info("State file cleared")
