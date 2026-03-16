from bs4 import BeautifulSoup, Tag

TAG_MAP = {
    "ac": "ac",
    "rare": "rare",
    "legend": "legend",
    "seasonal": "seasonal",
    "pseudo-rare": "pseudo_rare",
    "specialoffer": "special_offer",
    "beta": "beta",
    "colorcustom": "color_custom",
    "combat-animation": "custom_animation",
}


def parse_page_tags(soup: BeautifulSoup | Tag) -> tuple[list[str], dict[str, bool]]:
    tags_div = soup.select_one("div.page-tags span")
    if not tags_div:
        return [], {}

    raw_tags = [a.get_text(strip=True) for a in tags_div.find_all("a")]
    flags = {}
    for tag_text in raw_tags:
        field = TAG_MAP.get(tag_text)
        if field:
            flags[field] = True
    return raw_tags, flags


def parse_index_tag_images(element: Tag) -> list[str]:
    tags = []
    for img in element.find_all("img"):
        src = img.get("src", "")
        if "image-tags" not in src:
            continue
        filename = src.rsplit("/", 1)[-1]
        tag_name = filename.replace("small.png", "").replace("large.png", "").replace(".png", "")
        if tag_name:
            tags.append(tag_name)
    return tags
