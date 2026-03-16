import json
import re
from pathlib import Path


class Blacklist:
    def __init__(self, path: Path):
        self.slugs: set[str] = set()
        self.name_patterns: list[re.Pattern] = []
        self.categories: set[str] = set()
        if path.exists():
            data = json.loads(path.read_text())
            self.slugs = set(data.get("slugs", []))
            self.name_patterns = [
                re.compile(p, re.IGNORECASE) for p in data.get("name_patterns", [])
            ]
            self.categories = set(data.get("categories", []))

    def is_blocked(self, slug: str, name: str = "", category: str = "") -> bool:
        if slug in self.slugs:
            return True
        if category and category in self.categories:
            return True
        for pat in self.name_patterns:
            if pat.search(name):
                return True
        return False
