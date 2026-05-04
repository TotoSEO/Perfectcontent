"""Concurrent scraping with Firecrawl + Jina fallback. Tolerant to partial failures."""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import httpx

from app import cache
from app.config import get_settings

FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape"
JINA_URL = "https://r.jina.ai/{}"

PER_URL_BUDGET = 20.0
FIRECRAWL_TIMEOUT = 10.0
TTL = 60 * 60 * 72
COST_PER_URL = 0.001


@dataclass
class PageRaw:
    url: str
    markdown: str
    html: str | None
    title: str | None
    source: str  # "firecrawl" | "jina" | "cache"
    error: str | None = None


@dataclass
class ScrapeBatch:
    pages: list[PageRaw]
    failed_urls: list[str]
    cost: float


async def scrape_urls(urls: list[str], min_success: int = 4) -> ScrapeBatch:
    tasks = [_scrape_with_cache(u) for u in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    pages: list[PageRaw] = []
    failed: list[str] = []
    cost = 0.0
    for url, r in zip(urls, results):
        if isinstance(r, PageRaw) and r.error is None:
            pages.append(r)
            if r.source != "cache":
                cost += COST_PER_URL
        else:
            failed.append(url)

    if len(pages) < min_success:
        # Tolerance breached. Caller decides whether to abort, but we surface what we have.
        pass
    return ScrapeBatch(pages=pages, failed_urls=failed, cost=round(cost, 4))


async def _scrape_with_cache(url: str) -> PageRaw:
    key = cache.cache_key("scrape", url)
    hit = await cache.get(key)
    if hit is not None:
        return PageRaw(**hit, source="cache")

    page = await _scrape_one(url)
    if page.error is None:
        await cache.set(
            key,
            {
                "url": page.url,
                "markdown": page.markdown,
                "html": page.html,
                "title": page.title,
                "error": None,
            },
            ttl_seconds=TTL,
            cost_usd=COST_PER_URL,
        )
    return page


async def _scrape_one(url: str) -> PageRaw:
    if get_settings().mock_external:
        return _mock_page(url)

    started = time.monotonic()
    try:
        return await asyncio.wait_for(_firecrawl(url), timeout=FIRECRAWL_TIMEOUT)
    except (asyncio.TimeoutError, httpx.HTTPError, RuntimeError):
        remaining = max(1.0, PER_URL_BUDGET - (time.monotonic() - started))
        try:
            return await asyncio.wait_for(_jina(url), timeout=remaining)
        except Exception as exc:  # noqa: BLE001 - surface as error
            return PageRaw(url=url, markdown="", html=None, title=None, source="jina", error=str(exc))


async def _firecrawl(url: str) -> PageRaw:
    api_key = get_settings().firecrawl_api_key
    if not api_key:
        raise RuntimeError("firecrawl key not configured")
    async with httpx.AsyncClient(timeout=FIRECRAWL_TIMEOUT) as client:
        resp = await client.post(
            FIRECRAWL_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"url": url, "formats": ["markdown", "html"]},
        )
        resp.raise_for_status()
        data = resp.json().get("data") or {}
    return PageRaw(
        url=url,
        markdown=data.get("markdown") or "",
        html=data.get("html"),
        title=(data.get("metadata") or {}).get("title"),
        source="firecrawl",
    )


async def _jina(url: str) -> PageRaw:
    headers = {"Accept": "text/markdown"}
    jina_key = get_settings().jina_api_key
    if jina_key:
        headers["Authorization"] = f"Bearer {jina_key}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(JINA_URL.format(url), headers=headers)
        resp.raise_for_status()
        markdown = resp.text
    title = None
    for line in markdown.splitlines():
        if line.startswith("Title: "):
            title = line[len("Title: "):].strip()
            break
    return PageRaw(url=url, markdown=markdown, html=None, title=title, source="jina")


def _mock_page(url: str) -> PageRaw:
    return PageRaw(
        url=url,
        markdown=(
            f"# Titre de {url}\n\n"
            "Paragraphe d'intro.\n\n"
            "## Section A\nDétails A.\n\n"
            "## Section B\nDétails B.\n\n"
            "- élément 1\n- élément 2\n"
        ),
        html=f"<h1>Titre de {url}</h1><p>Paragraphe d'intro.</p>",
        title=f"Titre de {url}",
        source="firecrawl",
    )
