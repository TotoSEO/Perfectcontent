"""Parse a competitor page into structural elements (pure, no I/O).

Key behaviour: word/list/table counts are taken from the **main content area
only**, not from the full page. Otherwise nav menus, footer link lists,
sidebar widgets and "related articles" carousels inflate every metric and
the comparison table on the content page becomes useless (7 "tables" on a
single-table article, 5000+ "words" on a 300-word page, etc.).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from bs4 import BeautifulSoup, Tag


@dataclass
class ParsedPage:
    url: str
    title: str | None
    h1: str | None
    h2: list[str] = field(default_factory=list)
    h3: list[str] = field(default_factory=list)
    paragraphs: list[str] = field(default_factory=list)
    lists_count: int = 0
    tables_count: int = 0
    has_faq_schema: bool = False
    has_article_schema: bool = False
    has_product_schema: bool = False
    word_count: int = 0
    images_with_alt: int = 0
    images_without_alt: int = 0
    schemas: list[dict] = field(default_factory=list)
    published_at: datetime | None = None
    author: str | None = None


# Tags whose subtree is always boilerplate.
_BOILERPLATE_TAGS = {
    "nav", "header", "footer", "aside",
    "script", "style", "noscript", "template",
    "iframe", "form", "svg",
}

# ARIA roles that mark non-article regions.
_BOILERPLATE_ROLES = {
    "navigation", "banner", "contentinfo", "complementary",
    "search", "menubar", "menu", "dialog",
}

# Substring matchers on class/id (case-insensitive). If any token in the
# attribute matches one of these, the element is dropped entirely.
_BOILERPLATE_MATCHERS = re.compile(
    r"\b(?:"
    r"nav|navbar|navigation|menu|topbar|breadcrumbs?|"
    r"header|footer|sidebar|aside|widget|"
    r"comments?|disqus|"
    r"related(?:-?(?:posts?|articles?))?|read[-_]?more|"
    r"share|social|sharing|bookmark|"
    r"newsletter|subscribe|signup|"
    r"ad|ads|advert|advertisement|sponsor|promo|"
    r"cookie|gdpr|consent|popup|modal|drawer|overlay|"
    r"breadcrumb|pagination|tags?[-_]?cloud|"
    r"author[-_]?box|bio|profile-card"
    r")\b",
    re.IGNORECASE,
)


def parse_page(url: str, html: str | None, markdown: str | None) -> ParsedPage:
    if html:
        return _from_html(url, html)
    return _from_markdown(url, markdown or "")


def _strip_boilerplate(soup: BeautifulSoup) -> None:
    """Remove obvious boilerplate from the soup IN PLACE.

    Two-pass to stay safe: collect every element to drop, then decompose.
    Iterating + decomposing in one pass invalidates child references.
    """
    to_drop: list[Tag] = []
    for el in soup.find_all(True):
        if not isinstance(el, Tag):
            continue
        # Skip elements already orphaned by a previous decompose in this pass
        if el.attrs is None:
            continue
        if el.name in _BOILERPLATE_TAGS:
            to_drop.append(el)
            continue
        role = (el.get("role") or "").lower()
        if role in _BOILERPLATE_ROLES:
            to_drop.append(el)
            continue
        cls = " ".join(el.get("class") or [])
        ident = el.get("id") or ""
        haystack = f"{cls} {ident}"
        if haystack.strip() and _BOILERPLATE_MATCHERS.search(haystack):
            to_drop.append(el)
    for el in to_drop:
        # Skip if a parent was already decomposed and detached this element.
        try:
            el.decompose()
        except Exception:
            pass


def _select_main(soup: BeautifulSoup) -> Tag:
    """Try to locate the article body. Falls back to <body> (already stripped)."""
    # Order from most-specific to least.
    candidates: list[Tag | None] = [
        soup.find("article"),
        soup.find("main"),
        soup.find(attrs={"role": "main"}),
        soup.find("div", attrs={"id": re.compile(r"^(?:content|main|article|post)\b", re.IGNORECASE)}),
        soup.find("div", attrs={"class": re.compile(r"\b(?:post-content|article-content|entry-content|main-content)\b", re.IGNORECASE)}),
    ]
    for c in candidates:
        if isinstance(c, Tag) and c.get_text(strip=True):
            return c
    return soup.body or soup  # already boilerplate-stripped


def _word_count(t: Tag) -> int:
    txt = t.get_text(" ", strip=True)
    # Tokenise on whitespace, drop tokens that are pure punctuation / very
    # short noise. This still over-counts vs. a perfect content extraction
    # but it's directionally correct.
    tokens = [w for w in txt.split() if any(c.isalnum() for c in w)]
    return len(tokens)


def _from_html(url: str, html: str) -> ParsedPage:
    soup = BeautifulSoup(html, "html.parser")
    # Schemas have to be read BEFORE we strip <script> tags.
    schemas = _extract_jsonld(soup)
    schema_types = {_type(s) for s in schemas}

    # Title can stay as-is (the <title> tag isn't boilerplate, it's metadata).
    title = soup.title.string.strip() if soup.title and soup.title.string else None

    _strip_boilerplate(soup)
    main = _select_main(soup)

    h1 = main.find("h1") or soup.find("h1")
    page = ParsedPage(
        url=url,
        title=title,
        h1=h1.get_text(strip=True) if h1 else None,
        h2=[h.get_text(strip=True) for h in main.find_all("h2")],
        h3=[h.get_text(strip=True) for h in main.find_all("h3")],
        paragraphs=[p.get_text(" ", strip=True) for p in main.find_all("p")][:50],
        lists_count=len(main.find_all(["ul", "ol"])),
        tables_count=len(main.find_all("table")),
        has_faq_schema="FAQPage" in schema_types,
        has_article_schema=any(t in schema_types for t in {"Article", "BlogPosting", "NewsArticle"}),
        has_product_schema="Product" in schema_types,
        word_count=_word_count(main),
        images_with_alt=sum(1 for img in main.find_all("img") if (img.get("alt") or "").strip()),
        images_without_alt=sum(1 for img in main.find_all("img") if not (img.get("alt") or "").strip()),
        schemas=schemas,
        published_at=_extract_date(schemas),
        author=_extract_author(schemas),
    )
    return page


def _from_markdown(url: str, md: str) -> ParsedPage:
    h1_match = re.search(r"^#\s+(.*)$", md, flags=re.MULTILINE)
    h2 = [m.group(1).strip() for m in re.finditer(r"^##\s+(.*)$", md, flags=re.MULTILINE)]
    h3 = [m.group(1).strip() for m in re.finditer(r"^###\s+(.*)$", md, flags=re.MULTILINE)]
    paragraphs = [
        p.strip()
        for p in re.split(r"\n\s*\n", md)
        if p.strip() and not p.lstrip().startswith("#")
    ][:50]
    # Count distinct markdown tables via the alignment-row marker
    # `|---|---|` (one per table). Counting raw `\n|` over-counts by a factor
    # of the number of rows.
    tables_count = len(re.findall(r"^\s*\|[-:|\s]+\|\s*$", md, flags=re.MULTILINE))
    return ParsedPage(
        url=url,
        title=h1_match.group(1).strip() if h1_match else None,
        h1=h1_match.group(1).strip() if h1_match else None,
        h2=h2,
        h3=h3,
        paragraphs=paragraphs,
        lists_count=len(re.findall(r"^\s*[-*]\s+", md, flags=re.MULTILINE)),
        tables_count=tables_count,
        word_count=sum(1 for w in md.split() if any(c.isalnum() for c in w)),
    )


def _extract_jsonld(soup: BeautifulSoup) -> list[dict]:
    out: list[dict] = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, list):
            out.extend([d for d in data if isinstance(d, dict)])
        elif isinstance(data, dict):
            out.append(data)
    return out


def _type(schema: dict) -> str:
    t = schema.get("@type")
    if isinstance(t, list):
        return next((s for s in t if isinstance(s, str)), "")
    return t or ""


def _extract_date(schemas: list[dict]) -> datetime | None:
    for s in schemas:
        for key in ("datePublished", "dateCreated"):
            v = s.get(key)
            if isinstance(v, str):
                try:
                    return datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(timezone.utc)
                except ValueError:
                    continue
    return None


def _extract_author(schemas: list[dict]) -> str | None:
    for s in schemas:
        a = s.get("author")
        if isinstance(a, dict) and a.get("name"):
            return a["name"]
        if isinstance(a, list) and a and isinstance(a[0], dict) and a[0].get("name"):
            return a[0]["name"]
        if isinstance(a, str):
            return a
    return None
