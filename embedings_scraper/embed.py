#!/usr/bin/env python3
"""Embed cleaned AQW item images per category with Gemini embeddings."""

import argparse
import asyncio
import base64
import hashlib
import json
import logging
import mimetypes
import time
from pathlib import Path
from typing import Any

import aiohttp
import numpy as np
from tqdm import tqdm

try:
    from PIL import Image
except ImportError:  # pragma: no cover - handled at runtime
    Image = None

BASE_DIR = Path(__file__).resolve().parent
ITEMS_JSON = BASE_DIR / "items_images.json"
WIKI_ITEMS_JSON = BASE_DIR / "WikiItems.json"
GEMINI_KEYS_FILE = BASE_DIR / "gemini_keys.txt"
OUTPUT_DIR = BASE_DIR / "embeddings"
PREPARED_IMAGE_DIR = BASE_DIR / "embedding_input_cache"

MODEL = "models/gemini-embedding-2-preview"
API_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/{model}:embedContent"
REQUEST_TIMEOUT_SECONDS = 90
RATE_LIMIT_COOLDOWN_SECONDS = 60
MAX_RETRIES = 5
DEFAULT_SAVE_EVERY = 100
IMAGE_FIELDS = ("image_path", "male_image_path", "female_image_path")

logger = logging.getLogger("embed_images")

# Category -> cleaned image folder created by clean_images.py
CATEGORY_IMAGE_DIRS = {
    "armors": "cleaned_armors",
    "helmets-hoods": "cleaned_helmets",
    "capes-back-items": "cleaned_capes",
    "swords": "cleaned_weapons",
    "daggers": "cleaned_weapons",
    "maces": "cleaned_weapons",
    "polearms": "cleaned_weapons",
    "staffs": "cleaned_weapons",
    "axes": "cleaned_weapons",
    "guns": "cleaned_weapons",
    "bows": "cleaned_weapons",
    "gauntlets": "cleaned_weapons",
    "wands": "cleaned_weapons",
    "whips": "cleaned_weapons",
    "handguns": "cleaned_weapons",
    "rifles": "cleaned_weapons",
    "pets": "cleaned_pets",
    "battle-pets": "cleaned_pets",
    "grounds": "cleaned_ground",
}


class GeminiRateLimitError(Exception):
    """The current Gemini key was rate limited."""


class GeminiRequestError(Exception):
    """The Gemini request failed permanently."""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="embed",
        description="Embed cleaned AQW item images per category with Gemini.",
    )
    parser.add_argument(
        "--items-json",
        default=str(ITEMS_JSON),
        help=f"Path to items_images.json (default: {ITEMS_JSON}).",
    )
    parser.add_argument(
        "--wiki-items",
        default=str(WIKI_ITEMS_JSON),
        help=f"Path to WikiItems.json (default: {WIKI_ITEMS_JSON}).",
    )
    parser.add_argument(
        "--keys-file",
        default=str(GEMINI_KEYS_FILE),
        help=f"Path to gemini_keys.txt (default: {GEMINI_KEYS_FILE}).",
    )
    parser.add_argument(
        "--output-dir",
        default=str(OUTPUT_DIR),
        help=f"Directory for saved embedding files (default: {OUTPUT_DIR}).",
    )
    parser.add_argument(
        "--model",
        default=MODEL,
        help=f"Gemini embedding model to use (default: {MODEL}).",
    )
    parser.add_argument(
        "--categories",
        default="all",
        help="Comma-separated categories to embed (default: all).",
    )
    parser.add_argument(
        "--list-categories",
        action="store_true",
        help="List categories found in items_images.json and exit.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=20,
        help="Concurrent embedding requests (default: 20).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit images per category after resume filtering (default: 0 = all).",
    )
    parser.add_argument(
        "--save-every",
        type=int,
        default=DEFAULT_SAVE_EVERY,
        help=f"Save progress every N new embeddings (default: {DEFAULT_SAVE_EVERY}).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore existing outputs and rebuild category embeddings from scratch.",
    )
    return parser.parse_args(argv)


def load_json(path: str | Path) -> Any:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def load_keys(path: str | Path) -> list[str]:
    keys_path = Path(path)
    if not keys_path.exists():
        raise FileNotFoundError(
            f"Gemini keys file not found: {keys_path}. Add one API key per line."
        )

    keys = [
        line.strip()
        for line in keys_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not keys:
        raise ValueError(
            f"Gemini keys file is empty: {keys_path}. Add one API key per line."
        )
    return keys


def parse_wiki_item(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, list) or not payload:
        return {}

    info: dict[str, Any] = {
        "wiki_path": payload[0] if isinstance(payload[0], str) else None,
        "category": payload[-1] if isinstance(payload[-1], str) else None,
    }
    for field in payload[1:-1]:
        if not isinstance(field, list) or len(field) < 2 or not isinstance(field[0], str):
            continue
        key = field[0]
        if key in {"Description", "Damage", "Price", "Sellback", "Location"}:
            info[key.lower()] = field[1]
        elif isinstance(field[1], bool):
            info[key.lower().replace(" ", "_")] = field[1]
    return info


def build_wiki_lookup(wiki_items: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for name, payload in wiki_items.items():
        parsed = parse_wiki_item(payload)
        wiki_path = parsed.get("wiki_path")
        if not wiki_path:
            continue
        slug = str(wiki_path).lstrip("/")
        parsed["name"] = name
        lookup[slug] = parsed
    return lookup


def guess_mime_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(path.name)
    return mime_type or "image/png"


def prepare_image_for_embedding(image_path: Path) -> Path:
    if image_path.suffix.lower() != ".gif":
        return image_path

    if Image is None:
        raise RuntimeError(
            "GIF embedding requires Pillow. Install it with `pip install Pillow`."
        )

    relative_key = image_path.relative_to(BASE_DIR).as_posix()
    digest = hashlib.sha1(relative_key.encode("utf-8")).hexdigest()[:12]
    prepared_name = f"{image_path.stem}_{digest}.png"
    prepared_path = PREPARED_IMAGE_DIR / prepared_name
    prepared_path.parent.mkdir(parents=True, exist_ok=True)

    if prepared_path.exists() and prepared_path.stat().st_mtime >= image_path.stat().st_mtime:
        return prepared_path

    with Image.open(image_path) as img:
        img.seek(0)
        frame = img.convert("RGBA")
        frame.save(prepared_path, format="PNG")

    logger.info("Converted GIF to PNG for embedding: %s -> %s", image_path, prepared_path)
    return prepared_path


def parse_error_message(response_text: str) -> str:
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError:
        return response_text.strip() or "No response body"

    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        status = error.get("status")
        if message and status:
            return f"{status}: {message}"
        if message:
            return str(message)

    return response_text.strip() or "No response body"


class GeminiKeyPool:
    """Round-robin key pool with cooldown after 429 responses."""

    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise ValueError("Gemini key pool cannot be empty")
        self._keys = keys
        self._index = 0
        self._cooldowns = [0.0 for _ in keys]
        self._lock = asyncio.Lock()

    async def acquire(self) -> tuple[int, str]:
        while True:
            async with self._lock:
                now = time.monotonic()
                best_wait: float | None = None
                for offset in range(len(self._keys)):
                    index = (self._index + offset) % len(self._keys)
                    ready_at = self._cooldowns[index]
                    if ready_at <= now:
                        self._index = (index + 1) % len(self._keys)
                        return index, self._keys[index]
                    wait_time = ready_at - now
                    if best_wait is None or wait_time < best_wait:
                        best_wait = wait_time

            await asyncio.sleep(max(best_wait or 1.0, 0.25))

    async def report_rate_limit(self, index: int) -> None:
        async with self._lock:
            self._cooldowns[index] = time.monotonic() + RATE_LIMIT_COOLDOWN_SECONDS
            logger.warning("Gemini key slot %d hit 429; cooling down", index + 1)


async def request_embedding(
    session: aiohttp.ClientSession,
    api_key: str,
    model: str,
    image_path: Path,
) -> list[float]:
    prepared_path = prepare_image_for_embedding(image_path)
    image_b64 = base64.b64encode(prepared_path.read_bytes()).decode("ascii")
    payload = {
        "content": {
            "parts": [
                {
                    "inlineData": {
                        "mimeType": guess_mime_type(prepared_path),
                        "data": image_b64,
                    }
                }
            ]
        }
    }

    url = API_URL_TEMPLATE.format(model=model)
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }

    async with session.post(url, headers=headers, json=payload) as response:
        response_text = await response.text()
        if response.status == 429:
            raise GeminiRateLimitError(parse_error_message(response_text))
        if response.status >= 400:
            raise GeminiRequestError(
                f"Gemini API returned HTTP {response.status}: "
                f"{parse_error_message(response_text)}"
            )

    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise GeminiRequestError("Gemini API returned invalid JSON") from exc

    embedding = payload.get("embedding", {}).get("values")
    if not isinstance(embedding, list):
        raise GeminiRequestError("Gemini API response did not include embedding values")
    return embedding


async def embed_image(
    session: aiohttp.ClientSession,
    key_pool: GeminiKeyPool,
    model: str,
    image_path: Path,
) -> list[float]:
    last_rate_limit_error: GeminiRateLimitError | None = None

    for attempt in range(MAX_RETRIES):
        key_index, api_key = await key_pool.acquire()
        try:
            return await request_embedding(session, api_key, model, image_path)
        except GeminiRateLimitError as exc:
            last_rate_limit_error = exc
            await key_pool.report_rate_limit(key_index)
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            logger.warning(
                "Network error for %s on attempt %d/%d: %s",
                image_path.name,
                attempt + 1,
                MAX_RETRIES,
                exc,
            )
        if attempt + 1 < MAX_RETRIES:
            await asyncio.sleep(min(2**attempt, 8))

    if last_rate_limit_error is not None:
        raise GeminiRateLimitError(
            f"All retries exhausted due to rate limits for {image_path.name}"
        ) from last_rate_limit_error
    raise GeminiRequestError(f"Failed to embed image after retries: {image_path.name}")


def build_category_entries(
    items_data: dict[str, Any],
    wiki_lookup: dict[str, dict[str, Any]],
    categories: list[str] | None,
) -> dict[str, list[dict[str, Any]]]:
    entries_by_category: dict[str, list[dict[str, Any]]] = {}

    for category, items in items_data.items():
        if categories and category not in categories:
            continue

        cleaned_dir_name = CATEGORY_IMAGE_DIRS.get(category)
        if not cleaned_dir_name:
            logger.warning("Skipping unsupported category: %s", category)
            continue

        cleaned_dir = BASE_DIR / cleaned_dir_name
        category_entries: list[dict[str, Any]] = []

        for slug, image_info in items.items():
            wiki_meta = wiki_lookup.get(slug, {})
            item_name = wiki_meta.get("name", slug.replace("-", " ").title())

            for image_field in IMAGE_FIELDS:
                original_rel = image_info.get(image_field)
                if not original_rel:
                    continue

                original_name = Path(original_rel).name
                cleaned_path = cleaned_dir / original_name
                if not cleaned_path.exists():
                    logger.warning(
                        "Missing cleaned image for %s (%s): %s",
                        slug,
                        image_field,
                        cleaned_path,
                    )
                    continue

                entry_id = f"{category}:{slug}:{image_field}:{original_name}"
                category_entries.append(
                    {
                        "entry_id": entry_id,
                        "slug": slug,
                        "name": item_name,
                        "category": category,
                        "image_field": image_field,
                        "image_filename": original_name,
                        "cleaned_image_path": str(cleaned_path.relative_to(BASE_DIR)),
                        "original_image_path": original_rel,
                        "wiki_path": wiki_meta.get("wiki_path"),
                        "description": wiki_meta.get("description"),
                    }
                )

        entries_by_category[category] = category_entries

    return entries_by_category


def load_existing_image_cache(
    output_dir: Path,
    category: str,
) -> tuple[dict[str, list[float]], dict[str, dict[str, Any]]]:
    npy_path = output_dir / f"{category}_image_cache.npy"
    meta_path = output_dir / f"{category}_image_cache_meta.json"
    if not npy_path.exists() or not meta_path.exists():
        return {}, {}

    vectors = np.load(npy_path)
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    if len(vectors) != len(metadata):
        raise ValueError(
            f"Embedding file count mismatch for {category}: "
            f"{len(vectors)} vectors vs {len(metadata)} metadata rows"
        )

    existing_vectors: dict[str, list[float]] = {}
    existing_meta: dict[str, dict[str, Any]] = {}
    for index, meta in enumerate(metadata):
        entry_id = meta["entry_id"]
        existing_vectors[entry_id] = vectors[index].tolist()
        existing_meta[entry_id] = meta
    return existing_vectors, existing_meta


def save_image_cache(
    output_dir: Path,
    category: str,
    vectors_by_entry_id: dict[str, list[float]],
    metadata_by_entry_id: dict[str, dict[str, Any]],
) -> None:
    if not vectors_by_entry_id:
        logger.warning("[%s] No image-entry cache to save", category)
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    sorted_ids = sorted(vectors_by_entry_id)
    vectors = np.array(
        [vectors_by_entry_id[entry_id] for entry_id in sorted_ids],
        dtype=np.float32,
    )
    np.save(output_dir / f"{category}_image_cache.npy", vectors)

    metadata = [metadata_by_entry_id[entry_id] for entry_id in sorted_ids]
    with open(
        output_dir / f"{category}_image_cache_meta.json",
        "w",
        encoding="utf-8",
    ) as handle:
        json.dump(metadata, handle, ensure_ascii=True)

    logger.info("[%s] Saved %d image-entry cache rows", category, len(sorted_ids))


def aggregate_slug_embeddings(
    vectors_by_entry_id: dict[str, list[float]],
    metadata_by_entry_id: dict[str, dict[str, Any]],
) -> tuple[dict[str, list[float]], dict[str, dict[str, Any]]]:
    grouped_vectors: dict[str, list[np.ndarray]] = {}
    grouped_meta: dict[str, list[dict[str, Any]]] = {}

    for entry_id, vector in vectors_by_entry_id.items():
        meta = metadata_by_entry_id[entry_id]
        slug = meta["slug"]
        grouped_vectors.setdefault(slug, []).append(np.array(vector, dtype=np.float32))
        grouped_meta.setdefault(slug, []).append(meta)

    slug_vectors: dict[str, list[float]] = {}
    slug_meta: dict[str, dict[str, Any]] = {}

    for slug, vectors in grouped_vectors.items():
        stack = np.vstack(vectors)
        norms = np.linalg.norm(stack, axis=1, keepdims=True)
        norms[norms == 0] = 1
        normalized_stack = stack / norms
        mean_vector = normalized_stack.mean(axis=0)
        slug_vectors[slug] = mean_vector.astype(np.float32).tolist()

        metas = grouped_meta[slug]
        first = metas[0]
        slug_meta[slug] = {
            "slug": slug,
            "name": first["name"],
            "category": first["category"],
            "wiki_path": first.get("wiki_path"),
            "description": first.get("description"),
            "image_count": len(metas),
            "image_fields": [meta["image_field"] for meta in metas],
            "image_filenames": [meta["image_filename"] for meta in metas],
            "cleaned_image_paths": [meta["cleaned_image_path"] for meta in metas],
            "original_image_paths": [meta["original_image_path"] for meta in metas],
        }

    return slug_vectors, slug_meta


def save_slug_embeddings(
    output_dir: Path,
    category: str,
    slug_vectors: dict[str, list[float]],
    slug_meta: dict[str, dict[str, Any]],
) -> None:
    if not slug_vectors:
        logger.warning("[%s] No slug embeddings to save", category)
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    sorted_slugs = sorted(slug_vectors)
    vectors = np.array([slug_vectors[slug] for slug in sorted_slugs], dtype=np.float32)

    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    vectors = vectors / norms

    np.save(output_dir / f"{category}.npy", vectors)
    (output_dir / f"{category}.f32").write_bytes(
        np.asarray(vectors, dtype="<f4").tobytes()
    )

    metadata = [slug_meta[slug] for slug in sorted_slugs]
    with open(output_dir / f"{category}_meta.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=True)
    with open(output_dir / f"{category}_manifest.json", "w", encoding="utf-8") as handle:
        json.dump(
            {
                "category": category,
                "count": int(vectors.shape[0]),
                "dimensions": int(vectors.shape[1]),
                "dtype": "float32",
                "endianness": "little",
                "layout": "row-major",
                "normalized": True,
                "vectors_file": f"{category}.f32",
                "metadata_file": f"{category}_meta.json",
                "npy_file": f"{category}.npy",
            },
            handle,
            ensure_ascii=True,
        )

    logger.info(
        "[%s] Saved %d slug embeddings (.npy + .f32 + manifest)",
        category,
        len(sorted_slugs),
    )


async def embed_category(
    category: str,
    entries: list[dict[str, Any]],
    output_dir: Path,
    key_pool: GeminiKeyPool,
    model: str,
    concurrency: int,
    save_every: int,
    limit: int,
    force: bool,
) -> None:
    failure_path = output_dir / f"{category}_failed.json"
    existing_vectors: dict[str, list[float]] = {}
    existing_meta: dict[str, dict[str, Any]] = {}
    if not force:
        existing_vectors, existing_meta = load_existing_image_cache(output_dir, category)

    completed_ids = set(existing_vectors)
    todo = [entry for entry in entries if force or entry["entry_id"] not in completed_ids]
    if limit > 0:
        todo = todo[:limit]

    if not todo:
        if existing_vectors:
            slug_vectors, slug_meta = aggregate_slug_embeddings(
                existing_vectors,
                existing_meta,
            )
            save_slug_embeddings(output_dir, category, slug_vectors, slug_meta)
        if failure_path.exists():
            failure_path.unlink()
        logger.info("[%s] All done (%d cached)", category, len(completed_ids))
        return

    logger.info(
        "[%s] Embedding %d images (%d total, %d cached)",
        category,
        len(todo),
        len(entries),
        len(completed_ids),
    )

    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)
    semaphore = asyncio.Semaphore(concurrency)
    new_vectors: dict[str, list[float]] = {}
    new_meta: dict[str, dict[str, Any]] = {}
    failures: list[dict[str, str]] = []
    save_lock = asyncio.Lock()
    unsaved = 0
    progress = tqdm(total=len(todo), desc=category, unit="img")

    def flush() -> None:
        merged_vectors = dict(existing_vectors)
        merged_vectors.update(new_vectors)
        merged_meta = dict(existing_meta)
        merged_meta.update(new_meta)
        save_image_cache(output_dir, category, merged_vectors, merged_meta)
        slug_vectors, slug_meta = aggregate_slug_embeddings(merged_vectors, merged_meta)
        save_slug_embeddings(output_dir, category, slug_vectors, slug_meta)

    async with aiohttp.ClientSession(timeout=timeout) as session:

        async def worker(entry: dict[str, Any]) -> None:
            nonlocal unsaved
            image_path = BASE_DIR / entry["cleaned_image_path"]
            async with semaphore:
                try:
                    vector = await embed_image(session, key_pool, model, image_path)
                except Exception as exc:
                    logger.error("[%s] Failed %s: %s", category, entry["entry_id"], exc)
                    failures.append(
                        {"entry_id": entry["entry_id"], "error": str(exc)}
                    )
                    progress.update(1)
                    return

                new_vectors[entry["entry_id"]] = vector
                new_meta[entry["entry_id"]] = entry
                progress.update(1)

                async with save_lock:
                    unsaved += 1
                    if unsaved >= save_every:
                        flush()
                        unsaved = 0

        try:
            await asyncio.gather(*(worker(entry) for entry in todo))
        finally:
            progress.close()

    if new_vectors:
        flush()
    elif force and not existing_vectors:
        logger.warning("[%s] Nothing new was embedded", category)

    if failures:
        with open(failure_path, "w", encoding="utf-8") as handle:
            json.dump(failures, handle, ensure_ascii=True)
        logger.warning("[%s] %d images failed; see %s", category, len(failures), failure_path)
    elif failure_path.exists():
        failure_path.unlink()


def selected_categories(
    items_data: dict[str, Any],
    requested: str,
) -> list[str] | None:
    available = list(items_data.keys())
    if requested.lower() == "all":
        return None

    categories = [part.strip() for part in requested.split(",") if part.strip()]
    invalid = [category for category in categories if category not in available]
    if invalid:
        raise ValueError(
            "Unknown categories: "
            + ", ".join(invalid)
            + ". Use --list-categories to inspect valid names."
        )
    return categories


async def run(args: argparse.Namespace) -> None:
    items_data = load_json(args.items_json)
    wiki_lookup = build_wiki_lookup(load_json(args.wiki_items))

    if args.list_categories:
        for category, items in items_data.items():
            print(f"{category}: {len(items)} items")
        return

    categories = selected_categories(items_data, args.categories)
    entries_by_category = build_category_entries(items_data, wiki_lookup, categories)
    key_pool = GeminiKeyPool(load_keys(args.keys_file))
    output_dir = Path(args.output_dir)

    for category, entries in entries_by_category.items():
        if not entries:
            logger.warning("[%s] No cleaned images found, skipping", category)
            continue
        await embed_category(
            category=category,
            entries=entries,
            output_dir=output_dir,
            key_pool=key_pool,
            model=args.model,
            concurrency=args.concurrency,
            save_every=args.save_every,
            limit=args.limit,
            force=args.force,
        )


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
