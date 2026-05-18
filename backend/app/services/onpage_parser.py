"""DataForSEO On-Page Content Parsing — replacement for Firecrawl/Jina + BS4 parser.

DataForSEO's Content Parsing /live endpoint returns *pre-structured* page
content (header/footer/main_topic[]/secondary_topic[] with h_title, level,
primary_content[], tables, etc.) plus a clean `page_as_markdown` rendering.

That removes 3 layers of fragile machinery from the previous pipeline:
  1. Two HTTP scrapers with fallback (Firecrawl → Jina) and a quality gate
     that misclassified ~15% of pages.
  2. BeautifulSoup parsing of arbitrary HTML to extract H1/H2/H3.
  3. Markdown cleanup heuristics (`clean_markdown_text`) to strip Jina banners,
     blob URLs, code fences, etc. — DataForSEO returns clean markdown directly.

Pricing: $0.000125 per parsed page (DataForSEO Content Parsing live, base mode).
Cached 72h per URL — mirror of the previous scraper TTL.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx

from app import cache
from app.config import get_settings

CONTENT_PARSING_URL = "https://api.dataforseo.com/v3/on_page/content_parsing/live"
TTL = 60 * 60 * 72
COST_PER_URL = 0.000125  # DataForSEO Content Parsing base mode


@dataclass
class ParsedDoc:
    """Drop-in for the previous (PageRaw + ParsedPage) couple. One object per
    competitor URL, containing both raw markdown for term frequency analysis
    and structural metrics for the competitor comparison table."""
    url: str
    title: str | None = None
    h1: str | None = None
    h2: list[str] = field(default_factory=list)
    h3: list[str] = field(default_factory=list)
    paragraphs: list[str] = field(default_factory=list)
    lists_count: int = 0
    tables_count: int = 0
    has_faq_schema: bool = False
    has_article_schema: bool = False
    has_product_schema: bool = False
    word_count: int = 0
    author: str | None = None
    language: str | None = None
    markdown: str = ""
    source: str = "dataforseo"  # "dataforseo" | "cache"
    error: str | None = None


@dataclass
class ParseBatch:
    pages: list[ParsedDoc]
    failed: list[dict]
    cost: float


def _auth() -> tuple[str, str]:
    s = get_settings()
    return s.dataforseo_login, s.dataforseo_password


async def parse_urls(urls: list[str], *, min_success: int = 4) -> ParseBatch:
    """Fan out to DataForSEO Content Parsing for every URL in parallel.
    Errors on individual URLs don't fail the batch — they go into `failed`."""
    tasks = [_parse_with_cache(u) for u in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    pages: list[ParsedDoc] = []
    failed: list[dict] = []
    cost = 0.0
    for url, r in zip(urls, results):
        if isinstance(r, ParsedDoc) and r.error is None:
            pages.append(r)
            if r.source != "cache":
                cost += COST_PER_URL
        elif isinstance(r, ParsedDoc):
            failed.append({"url": url, "error": r.error or "unknown", "source": r.source})
        else:
            failed.append({"url": url, "error": str(r), "source": "exception"})
    return ParseBatch(pages=pages, failed=failed, cost=round(cost, 6))


async def _parse_with_cache(url: str) -> ParsedDoc:
    key = cache.cache_key("onpage_parse", url)
    hit = await cache.get(key)
    if hit is not None:
        try:
            return _from_dict(hit, source="cache")
        except Exception:
            pass

    doc = await _parse_one(url)
    if doc.error is None:
        await cache.set(key, _to_dict(doc), ttl_seconds=TTL, cost_usd=COST_PER_URL)
    return doc


async def _parse_one(url: str) -> ParsedDoc:
    if get_settings().mock_external:
        return _mock_doc(url)

    body = [{"url": url, "markdown_view": True}]
    try:
        async with httpx.AsyncClient(timeout=60, auth=_auth()) as client:
            resp = await client.post(CONTENT_PARSING_URL, json=body)
            resp.raise_for_status()
            payload = resp.json()
    except httpx.HTTPError as exc:
        return ParsedDoc(url=url, error=f"http: {exc}", source="dataforseo")
    return _build_doc(url, payload)


def _build_doc(url: str, payload: dict[str, Any]) -> ParsedDoc:
    tasks = payload.get("tasks") or []
    if not tasks:
        return ParsedDoc(url=url, error="empty tasks[]", source="dataforseo")
    t = tasks[0]
    if t.get("status_code") and t["status_code"] >= 40000:
        return ParsedDoc(
            url=url,
            error=f"DFS {t['status_code']}: {t.get('status_message', '')[:200]}",
            source="dataforseo",
        )

    results = t.get("result") or []
    if not results:
        return ParsedDoc(url=url, error="empty result[]", source="dataforseo")
    items = (results[0].get("items") or [])
    if not items:
        return ParsedDoc(url=url, error="empty items[]", source="dataforseo")
    item = items[0]

    page_content = item.get("page_content") or {}
    markdown = item.get("page_as_markdown") or ""

    main = page_content.get("main_topic") or []
    secondary = page_content.get("secondary_topic") or []

    h1: str | None = None
    h2: list[str] = []
    h3: list[str] = []
    paragraphs: list[str] = []
    tables_count = 0
    lists_count = 0
    author: str | None = None
    language: str | None = None

    # main_topic is usually a single block holding the page hierarchy.
    # Walk every topic, classify titles by level.
    for topic in main + secondary:
        if not isinstance(topic, dict):
            continue
        title = topic.get("h_title") or topic.get("main_title")
        level = topic.get("level")
        if title:
            if level == 1 and not h1:
                h1 = title
            elif level == 2:
                h2.append(title)
            elif level == 3:
                h3.append(title)
        if not author and topic.get("author"):
            author = topic.get("author")
        if not language and topic.get("language"):
            language = topic.get("language")
        for blk in (topic.get("primary_content") or []) + (topic.get("secondary_content") or []):
            if not isinstance(blk, dict):
                continue
            txt = (blk.get("text") or "").strip()
            if txt and len(txt) > 30:
                paragraphs.append(txt)
        if topic.get("table_content"):
            tables_count += len(topic["table_content"])

    # Lists aren't explicitly returned — proxy via bullet/markdown count.
    if markdown:
        lists_count = sum(1 for ln in markdown.splitlines() if ln.lstrip().startswith(("- ", "* ", "1. ", "2. ", "3. ")))

    # Word count from the markdown (DataForSEO already stripped boilerplate).
    word_count = sum(1 for w in markdown.split() if any(c.isalnum() for c in w))

    # Schema detection: DataForSEO returns structured `ratings`, `offers`, `comments`
    # — treat their presence as a proxy for schema.org markup.
    has_product_schema = bool(page_content.get("offers"))
    has_faq_schema = bool(page_content.get("comments"))
    has_article_schema = bool(main) and word_count > 200

    page_meta = (results[0].get("meta") or {}) if isinstance(results[0], dict) else {}
    page_title = page_meta.get("title") or h1

    if not markdown.strip() and not h1 and not paragraphs:
        return ParsedDoc(url=url, error="content parsing returned empty page", source="dataforseo")

    return ParsedDoc(
        url=url,
        title=page_title,
        h1=h1,
        h2=h2,
        h3=h3,
        paragraphs=paragraphs,
        lists_count=lists_count,
        tables_count=tables_count,
        has_faq_schema=has_faq_schema,
        has_article_schema=has_article_schema,
        has_product_schema=has_product_schema,
        word_count=word_count,
        author=author,
        language=language,
        markdown=markdown,
        source="dataforseo",
    )


def _to_dict(d: ParsedDoc) -> dict:
    return {
        "url": d.url,
        "title": d.title,
        "h1": d.h1,
        "h2": d.h2,
        "h3": d.h3,
        "paragraphs": d.paragraphs,
        "lists_count": d.lists_count,
        "tables_count": d.tables_count,
        "has_faq_schema": d.has_faq_schema,
        "has_article_schema": d.has_article_schema,
        "has_product_schema": d.has_product_schema,
        "word_count": d.word_count,
        "author": d.author,
        "language": d.language,
        "markdown": d.markdown,
    }


def _from_dict(d: dict, *, source: str) -> ParsedDoc:
    return ParsedDoc(source=source, **d)


def _mock_doc(url: str) -> ParsedDoc:
    return ParsedDoc(
        url=url,
        title=f"Mock title for {url}",
        h1="Titre principal mock",
        h2=["Section A", "Section B", "Section C"],
        h3=["Sous-section 1", "Sous-section 2"],
        paragraphs=[
            "Premier paragraphe mock avec un contenu réaliste sur le sujet ciblé. " * 3,
            "Second paragraphe mock détaillant les caractéristiques importantes. " * 3,
        ],
        lists_count=2,
        tables_count=1,
        has_article_schema=True,
        word_count=420,
        author="Auteur Mock",
        language="fr",
        markdown=(
            "# Titre principal mock\n\n"
            "Premier paragraphe avec contenu pertinent sur le sujet.\n\n"
            "## Section A\n\nDétails de la section A avec termes spécifiques.\n\n"
            "## Section B\n\nDétails de la section B.\n"
        ),
        source="dataforseo",
    )
