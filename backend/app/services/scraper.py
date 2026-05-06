"""Concurrent scraping with Firecrawl + Jina fallback. Tolerant to partial failures.

Quality gate: every successful HTTP fetch is run through `_scrape_quality()` to
catch bot blocks (Cloudflare, captcha), JS-only shells, paywall splash pages,
404-as-200 and quasi-empty bodies. These return as `PageRaw` with `error` set
so they don't reach the parser, the LLM analysis, or the competitors table —
which would otherwise be filled with fake numbers ("3 mots", "0 H2") and waste
tokens making Claude reason about junk.
"""
from __future__ import annotations

import asyncio
import re
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

# Hard quality thresholds. Real top-SERP articles always clear these by 10×+;
# bot-block pages and JS shells fail.
_MIN_BODY_CHARS = 400
_MIN_BODY_WORDS = 80
_MAX_LINK_DENSITY = 0.6  # if >60% of body chars are inside [..](..)  → menu page

# Common bot/WAF/paywall/JS-required signatures. Case-insensitive substring match
# inside the first 4 KB of the body. One match → reject.
_GARBAGE_PATTERNS = [
    r"just a moment",
    r"checking your browser",
    r"attention required.*cloudflare",
    r"please enable javascript",
    r"enable javascript and cookies",
    r"javascript is required",
    r"this site requires javascript",
    r"access denied",
    r"you don'?t have permission",
    r"403 forbidden",
    r"are you a robot",
    r"verify you (?:are )?human",
    r"complete the captcha",
    r"this site is protected by recaptcha",
    r"cf-ray",
    r"page not found",
    r"this page (?:does not exist|doesn'?t exist|isn'?t available)",
    r"please log in to (?:read|continue|access)",
    r"subscribe to (?:read|continue)",
    r"this content is for subscribers",
    r"site temporarily unavailable",
    r"the site is currently down",
]
_GARBAGE_RE = re.compile("|".join(f"({p})" for p in _GARBAGE_PATTERNS), re.IGNORECASE)

# Jina's reader prepends a 4-line header. Strip before measuring body density.
_JINA_HEADER_RE = re.compile(
    r"^(?:Title|URL Source|Published Time|Markdown Content|Warning):.*$\n?",
    re.MULTILINE,
)
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]+\)")
_MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")


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
    failed: list[dict]  # [{url, error, source}]
    cost: float


async def scrape_urls(urls: list[str], min_success: int = 4) -> ScrapeBatch:
    tasks = [_scrape_with_cache(u) for u in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    pages: list[PageRaw] = []
    failed: list[dict] = []
    cost = 0.0
    for url, r in zip(urls, results):
        if isinstance(r, PageRaw) and r.error is None:
            pages.append(r)
            if r.source != "cache":
                cost += COST_PER_URL
        elif isinstance(r, PageRaw):
            failed.append({"url": url, "error": r.error or "unknown", "source": r.source})
        else:
            failed.append({"url": url, "error": str(r), "source": "exception"})

    if len(pages) < min_success:
        # Tolerance breached. Caller decides whether to abort, but we surface what we have.
        pass
    return ScrapeBatch(pages=pages, failed=failed, cost=round(cost, 4))


def _scrape_quality(markdown: str, html: str | None) -> str | None:
    """Return an error reason if the scrape result is unusable, else None.

    Order of cheapest-to-most-expensive checks. Strips Jina's header block and
    markdown links/images before measuring body density so a normal article
    full of citations isn't penalised."""
    if not markdown or not markdown.strip():
        return "empty body"

    body = _JINA_HEADER_RE.sub("", markdown).strip()
    if not body:
        return "empty body after header strip"

    # 1. Bot-block / WAF / paywall / JS-required signatures.
    sniff = body[:4000].lower()
    m = _GARBAGE_RE.search(sniff)
    if m:
        snippet = m.group(0)[:60].strip().lower()
        return f"blocked: {snippet}"

    # 2. Strip links + images, then measure plain prose density.
    prose = _MD_IMAGE_RE.sub("", body)
    prose = _MD_LINK_RE.sub(r"\1", prose)
    # Drop bare-URL lines and bullets-of-links lines.
    prose_lines = [
        ln for ln in prose.splitlines()
        if ln.strip() and not re.fullmatch(r"\s*[-*]?\s*https?://\S+\s*", ln)
    ]
    prose = "\n".join(prose_lines).strip()

    if len(prose) < _MIN_BODY_CHARS:
        return f"body too short ({len(prose)} chars)"
    word_count = sum(1 for w in prose.split() if any(c.isalnum() for c in w))
    if word_count < _MIN_BODY_WORDS:
        return f"body too short ({word_count} words)"

    # 3. Link-density: pages that are mostly menu / index / "related articles"
    # pass length thresholds but carry no editorial value.
    link_chars = sum(len(mm.group(0)) for mm in _MD_LINK_RE.finditer(body))
    if len(body) > 0 and link_chars / len(body) > _MAX_LINK_DENSITY:
        return "mostly link list (menu/index page)"

    return None


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
    page: PageRaw
    try:
        page = await asyncio.wait_for(_firecrawl(url), timeout=FIRECRAWL_TIMEOUT)
    except (asyncio.TimeoutError, httpx.HTTPError, RuntimeError):
        remaining = max(1.0, PER_URL_BUDGET - (time.monotonic() - started))
        try:
            page = await asyncio.wait_for(_jina(url), timeout=remaining)
        except Exception as exc:  # noqa: BLE001 - surface as error
            return PageRaw(url=url, markdown="", html=None, title=None, source="jina", error=str(exc))

    # Quality gate: HTTP 200 doesn't mean the body is usable. Catch bot blocks,
    # JS shells, paywalls, empty/menu pages here so they never reach the
    # parser, the LLM analysis, or the competitors comparison table.
    reason = _scrape_quality(page.markdown, page.html)
    if reason:
        return PageRaw(
            url=url, markdown="", html=None, title=page.title,
            source=page.source, error=reason,
        )
    return page


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
