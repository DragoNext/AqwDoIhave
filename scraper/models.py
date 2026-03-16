from dataclasses import dataclass, field


@dataclass
class CategoryItem:
    """An item found on a category index page."""
    name: str
    wiki_path: str  # e.g. "/abyssal-angel-s-shadow"
    index_tags: list[str] = field(default_factory=list)  # tags from category page images
    category: str = ""


@dataclass
class ItemDetail:
    """Full details parsed from an item's wiki page."""
    name: str
    wiki_path: str
    category: str
    price: list = field(default_factory=lambda: ["N/A"])
    sellback: list = field(default_factory=lambda: ["0", "GOLD"])
    description: str = ""
    damage: list | str = "N/A"  # "N/A" or [min, max, bonus]
    location: list = field(default_factory=lambda: ["N/A"])
    rare: bool = False
    ac: bool = False
    legend: bool = False
    seasonal: bool = False
    pseudo_rare: bool = False
    special_offer: bool = False
    beta: bool = False
    color_custom: bool = False
    custom_animation: bool = False
    image_urls: list[str] = field(default_factory=list)
    page_tags: list[str] = field(default_factory=list)

    def to_json_entry(self) -> list:
        """Convert to the 16-element array format used by WikiItems.json."""
        return [
            self.wiki_path,
            ["Price", self.price],
            ["Sellback", self.sellback],
            ["Description", self.description],
            ["Damage", self.damage],
            ["Location", self.location],
            ["Rare", self.rare],
            ["AC", self.ac],
            ["Legend", self.legend],
            ["Seasonal", self.seasonal],
            ["Pseudo Rare", self.pseudo_rare],
            ["Special Offer", self.special_offer],
            ["Beta", self.beta],
            ["Color Custom", self.color_custom],
            ["Custom Animation", self.custom_animation],
            self.category,
        ]
