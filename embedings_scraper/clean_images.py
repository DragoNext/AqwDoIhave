#!/usr/bin/env python3
"""Clean item images using an image model, organized by category."""
import argparse
import asyncio
import base64
import json
import logging
import mimetypes
from pathlib import Path
from typing import Any

import aiohttp
from tqdm import tqdm

BASE_DIR = Path(__file__).resolve().parent
ITEMS_JSON = BASE_DIR / "items_images.json"
PROMPTS_CONFIG = BASE_DIR / "clean.config"
GEMINI_KEYS_FILE = BASE_DIR / "gemini_keys.txt"
DEFAULT_MODEL = "gemini-3.1-flash-image-preview"
API_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
REQUEST_TIMEOUT_SECONDS = 180

logger = logging.getLogger("clean_images")

MAX_RETRIES = 5

# Category -> output folder + prompt type config section
CATEGORY_CONFIG = {
    "armors": {"output_folder": "cleaned_armors", "prompt_type": "armors"},
    "helmets-hoods": {"output_folder": "cleaned_helmets", "prompt_type": "helmets"},
    "capes-back-items": {"output_folder": "cleaned_capes", "prompt_type": "capes"},
    "swords": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "daggers": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "maces": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "polearms": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "staffs": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "axes": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "guns": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "bows": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "gauntlets": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "wands": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "whips": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "handguns": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "rifles": {"output_folder": "cleaned_weapons", "prompt_type": "weapons"},
    "pets": {"output_folder": "cleaned_pets", "prompt_type": "pets"},
    "battle-pets": {"output_folder": "cleaned_pets", "prompt_type": "pets"},
    "grounds": {"output_folder": "cleaned_ground", "prompt_type": "grounds"},
}


class CleanConfigError(Exception):
    """Prompt configuration is missing or invalid."""


class GeminiRateLimitError(Exception):
    """All available Gemini keys were rate limited for the current attempt."""


class GeminiRequestError(Exception):
    """Gemini request failed."""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="clean_images",
        description="Clean item images with an image model, organized by category.",
    )
    parser.add_argument(
        "--items-json",
        default=str(ITEMS_JSON),
        help=f"Path to items_images.json (default: {ITEMS_JSON}).",
    )
    parser.add_argument(
        "--config",
        default=str(PROMPTS_CONFIG),
        help=f"Path to clean.config (default: {PROMPTS_CONFIG}).",
    )
    parser.add_argument(
        "--keys-file",
        default=str(GEMINI_KEYS_FILE),
        help=f"Path to gemini_keys.txt (default: {GEMINI_KEYS_FILE}).",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Gemini image model to use (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Max concurrent image model requests (default: 5).",
    )
    parser.add_argument(
        "--categories",
        default="all",
        help="Comma-separated categories to process (default: all).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-clean images even if output already exists.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of images to process (default: 0 = all).",
    )
    return parser.parse_args(argv)


class GeminiKeyPool:
    """Shared Gemini API key rotation with failover on rate limit."""

    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise ValueError("Gemini key pool cannot be empty")
        self._keys = keys
        self._index = 0
        self._lock = asyncio.Lock()

    async def rotation_order(self) -> list[tuple[int, str]]:
        async with self._lock:
            start = self._index
            return [
                (index, self._keys[index])
                for index in (
                    (start + offset) % len(self._keys)
                    for offset in range(len(self._keys))
                )
            ]

    async def rotate_after_rate_limit(self, exhausted_index: int) -> None:
        async with self._lock:
            if self._index != exhausted_index:
                return
            next_index = (self._index + 1) % len(self._keys)
            self._index = next_index
            logger.warning(
                "Gemini key slot %d hit 429, rotating to slot %d",
                exhausted_index + 1,
                next_index + 1,
            )


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


def load_prompt_config(path: str | Path) -> dict[str, str]:
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(
            f"Prompt config not found: {config_path}. Create the file before running."
        )

    prompts: dict[str, str] = {}
    current_section: str | None = None
    current_lines: list[str] = []

    def flush_section() -> None:
        nonlocal current_section, current_lines
        if current_section is None:
            return
        prompt = "\n".join(current_lines).strip()
        if not prompt:
            raise CleanConfigError(
                f"Prompt section [{current_section}] is empty in {config_path}"
            )
        prompts[current_section] = prompt
        current_section = None
        current_lines = []

    for line_number, raw_line in enumerate(
        config_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        stripped = raw_line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            flush_section()
            section_name = stripped[1:-1].strip()
            if not section_name:
                raise CleanConfigError(
                    f"Empty section header at line {line_number} in {config_path}"
                )
            current_section = section_name
            current_lines = []
            continue

        if current_section is None:
            if not stripped or stripped.startswith("#"):
                continue
            raise CleanConfigError(
                f"Content before any [type] header at line {line_number} in {config_path}"
            )

        current_lines.append(raw_line)

    flush_section()

    if not prompts:
        raise CleanConfigError(
            f"No prompt sections found in {config_path}. Add sections like [weapons]."
        )

    return prompts


def guess_mime_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(path.name)
    return mime_type or "image/png"


def extract_image_bytes(response_data: dict[str, Any]) -> bytes:
    for candidate in response_data.get("candidates", []):
        parts = candidate.get("content", {}).get("parts", [])
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data")
            if not inline:
                continue
            image_b64 = inline.get("data")
            if image_b64:
                return base64.b64decode(image_b64)

    raise GeminiRequestError("Gemini response did not contain an output image")


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

    if isinstance(payload, dict) and payload.get("promptFeedback"):
        return json.dumps(payload["promptFeedback"], ensure_ascii=True)

    return response_text.strip() or "No response body"


async def request_gemini_image(
    session: aiohttp.ClientSession,
    model: str,
    api_key: str,
    input_path: Path,
    prompt: str,
) -> bytes:
    image_bytes = input_path.read_bytes()
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": guess_mime_type(input_path),
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        }
                    },
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
        },
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
        response_data = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise GeminiRequestError("Gemini API returned invalid JSON") from exc

    return extract_image_bytes(response_data)


async def clean_image(
    session: aiohttp.ClientSession,
    key_pool: GeminiKeyPool,
    model: str,
    input_path: Path,
    output_path: Path,
    prompt: str,
) -> None:
    """Clean a single image using Gemini image editing."""
    last_rate_limit_error: GeminiRateLimitError | None = None

    for key_index, api_key in await key_pool.rotation_order():
        try:
            cleaned_bytes = await request_gemini_image(
                session=session,
                model=model,
                api_key=api_key,
                input_path=input_path,
                prompt=prompt,
            )
            output_path.write_bytes(cleaned_bytes)
            return
        except GeminiRateLimitError as exc:
            last_rate_limit_error = exc
            await key_pool.rotate_after_rate_limit(key_index)
            continue

    if last_rate_limit_error is not None:
        raise GeminiRateLimitError(
            f"All Gemini keys hit 429 while processing {input_path.name}"
        ) from last_rate_limit_error

    raise GeminiRequestError(f"Unable to process image: {input_path.name}")


async def clean_with_retry(
    session: aiohttp.ClientSession,
    key_pool: GeminiKeyPool,
    model: str,
    input_path: Path,
    output_path: Path,
    prompt: str,
) -> bool:
    """Clean an image with retries. Returns True on success."""
    for attempt in range(MAX_RETRIES):
        try:
            await clean_image(
                session=session,
                key_pool=key_pool,
                model=model,
                input_path=input_path,
                output_path=output_path,
                prompt=prompt,
            )
            return True
        except Exception as exc:
            logger.warning(
                "Retry %d/%d for %s: %s",
                attempt + 1,
                MAX_RETRIES,
                input_path.name,
                exc,
            )
            if attempt + 1 < MAX_RETRIES:
                await asyncio.sleep(min(2**attempt, 8))
    logger.error("Failed after %d retries: %s", MAX_RETRIES, input_path.name)
    return False


def collect_tasks(
    data: dict,
    prompt_config: dict[str, str],
    prompt_config_path: str | Path,
    categories: list[str] | None,
    force: bool,
) -> list[tuple[Path, Path, str]]:
    """Build list of (input_path, output_path, prompt) for all images to process."""
    tasks = []

    for category, items in data.items():
        if categories and category not in categories:
            continue

        category_entry = CATEGORY_CONFIG.get(category)
        if not category_entry:
            continue

        folder_name = category_entry["output_folder"]
        prompt_type = category_entry["prompt_type"]
        prompt = prompt_config.get(prompt_type)
        if not prompt:
            raise CleanConfigError(
                f"Missing prompt section [{prompt_type}] required for category "
                f"{category!r} in {Path(prompt_config_path)}"
            )

        output_dir = BASE_DIR / folder_name
        output_dir.mkdir(parents=True, exist_ok=True)

        for slug, paths in items.items():
            image_paths = []
            if "image_path" in paths:
                image_paths.append(paths["image_path"])
            if "male_image_path" in paths:
                image_paths.append(paths["male_image_path"])
            if "female_image_path" in paths:
                image_paths.append(paths["female_image_path"])

            for img_rel in image_paths:
                input_path = BASE_DIR / img_rel
                if not input_path.exists():
                    continue
                output_path = output_dir / input_path.name
                if not force and output_path.exists():
                    continue
                tasks.append((input_path, output_path, prompt))

    return tasks


async def run(args: argparse.Namespace) -> None:
    with open(args.items_json, encoding="utf-8") as f:
        data = json.load(f)
    prompt_config = load_prompt_config(args.config)
    key_pool = GeminiKeyPool(load_keys(args.keys_file))

    categories = None
    if args.categories.lower() != "all":
        categories = [c.strip() for c in args.categories.split(",") if c.strip()]

    tasks = collect_tasks(data, prompt_config, args.config, categories, args.force)

    if not tasks:
        print("All images already cleaned")
        return

    if args.limit > 0:
        tasks = tasks[: args.limit]

    logger.info("Cleaning %d images (concurrency: %d)", len(tasks), args.concurrency)

    sem = asyncio.Semaphore(args.concurrency)
    bar = tqdm(total=len(tasks), desc="Cleaning", unit="img")
    success = 0
    failed = 0
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)

    async with aiohttp.ClientSession(timeout=timeout) as session:

        async def do_one(input_path: Path, output_path: Path, prompt: str) -> None:
            nonlocal success, failed
            async with sem:
                ok = await clean_with_retry(
                    session=session,
                    key_pool=key_pool,
                    model=args.model,
                    input_path=input_path,
                    output_path=output_path,
                    prompt=prompt,
                )
                if ok:
                    success += 1
                else:
                    failed += 1
                bar.update(1)

        await asyncio.gather(*[do_one(i, o, p) for i, o, p in tasks])
    bar.close()

    print(f"Done: {success} cleaned, {failed} failed")


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
