import asyncio
import logging
import re

import aiohttp

logger = logging.getLogger(__name__)


class WikiClient:
    def __init__(self, base_url: str, concurrency: int = 5, delay: float = 0.2,
                 max_retries: int = 30):
        self.base_url = base_url.rstrip("/")
        self.concurrency = concurrency
        self.delay = delay
        self.max_retries = max_retries
        self._semaphore = asyncio.Semaphore(concurrency)
        self._session: aiohttp.ClientSession | None = None
        self._wikidot_token: str | None = None

    async def __aenter__(self):
        self._session = aiohttp.ClientSession(
            headers={"User-Agent": "AQWDoIHave-Scraper/1.0"},
            timeout=aiohttp.ClientTimeout(total=30),
        )
        return self

    async def __aexit__(self, *exc):
        if self._session:
            await self._session.close()

    async def _acquire_wikidot_token(self):
        """Fetch any page to get the wikidot_token7 cookie."""
        if self._wikidot_token:
            return
        async with self._semaphore:
            async with self._session.get(self.base_url) as resp:
                resp.raise_for_status()
                html = await resp.text()
        for cookie in self._session.cookie_jar:
            if cookie.key == "wikidot_token7":
                self._wikidot_token = cookie.value
                logger.info("Got wikidot_token7 from cookie")
                return
        m = re.search(r'WIKIREQUEST\.info\.wikidot_token7\s*=\s*"([^"]+)"', html)
        if m:
            self._wikidot_token = m.group(1)
            logger.info("Got wikidot_token7 from HTML")
            return
        logger.warning("Could not find wikidot_token7, recent-changes AJAX may fail")

    async def fetch_page(self, path: str, track_redirect: bool = False) -> str | tuple[str, str]:
        url = f"{self.base_url}{path}"
        return await self._fetch_with_retry(url, track_redirect=track_redirect)

    async def fetch_ajax(self, module_name: str, params: dict) -> dict:
        if not self._wikidot_token:
            await self._acquire_wikidot_token()
        url = f"{self.base_url}/ajax-module-connector.php"
        body = {
            "moduleName": module_name,
            "wikidot_token7": self._wikidot_token or "",
            **params,
        }
        return await self._fetch_with_retry(url, method="POST", data=body, as_json=True)

    async def _fetch_with_retry(self, url: str, method: str = "GET",
                                data: dict | None = None, as_json: bool = False,
                                track_redirect: bool = False):
        last_exc = None
        for attempt in range(self.max_retries):
            async with self._semaphore:
                try:
                    if method == "POST":
                        async with self._session.post(url, data=data) as resp:
                            if 400 <= resp.status < 500:
                                resp.raise_for_status()
                            if resp.status >= 500:
                                raise aiohttp.ClientResponseError(
                                    resp.request_info, resp.history,
                                    status=resp.status, message=f"Server error {resp.status}",
                                )
                            result = await (resp.json(content_type=None) if as_json else resp.text())
                    else:
                        async with self._session.get(url) as resp:
                            if 400 <= resp.status < 500:
                                resp.raise_for_status()
                            if resp.status >= 500:
                                raise aiohttp.ClientResponseError(
                                    resp.request_info, resp.history,
                                    status=resp.status, message=f"Server error {resp.status}",
                                )
                            result = await (resp.json(content_type=None) if as_json else resp.text())
                            if track_redirect:
                                final_path = resp.url.path
                                await asyncio.sleep(self.delay)
                                return result, final_path
                    await asyncio.sleep(self.delay)
                    return result
                except (aiohttp.ClientResponseError) as e:
                    if e.status and 400 <= e.status < 500:
                        raise
                    last_exc = e
                    wait = 1.0 + attempt
                    logger.warning("Retry %d/%d for %s: %s (wait %.0fs)",
                                   attempt + 1, self.max_retries, url, e, wait)
                    await asyncio.sleep(wait)
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    last_exc = e
                    wait = 1.0 + attempt
                    logger.warning("Retry %d/%d for %s: %s (wait %.0fs)",
                                   attempt + 1, self.max_retries, url, e, wait)
                    await asyncio.sleep(wait)
        raise last_exc
