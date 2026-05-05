"""Parse a competitor page into structural elements (pure, no I/O)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from bs4 import BeautifulSoup


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


def parse_page(url: str, html: str | None, markdown: str | None) -> ParsedPage:
    if html:
        return _from_html(url, html)
    return _from_markdown(url, markdown or "")


def _from_html(url: str, html: str) -> ParsedPage:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    schemas = _extract_jsonld(soup)
    schema_types = {_type(s) for s in schemas}
    h1 = soup.find("h1")
    page = ParsedPage(
        url=url,
        title=(soup.title.string.strip() if soup.title and soup.title.string else None),
        h1=h1.get_text(strip=True) if h1 else None,
        h2=[h.get_text(strip=True) for h in soup.find_all("h2")],
        h3=[h.get_text(strip=True) for h in soup.find_all("h3")],
        paragraphs=[p.get_text(" ", strip=True) for p in soup.find_all("p")][:50],
        lists_count=len(soup.find_all(["ul", "ol"])),
        tables_count=len(soup.find_all("table")),
        has_faq_schema="FAQPage" in schema_types,
        has_article_schema=any(t in schema_types for t in {"Article", "BlogPosting", "NewsArticle"}),
        has_product_schema="Product" in schema_types,
        word_count=len(text.split()),
        images_with_alt=sum(1 for img in soup.find_all("img") if (img.get("alt") or "").strip()),
        images_without_alt=sum(1 for img in soup.find_all("img") if not (img.get("alt") or "").strip()),
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
    return ParsedPage(
        url=url,
        title=h1_match.group(1).strip() if h1_match else None,
        h1=h1_match.group(1).strip() if h1_match else None,
        h2=h2,
        h3=h3,
        paragraphs=paragraphs,
        lists_count=len(re.findall(r"^\s*[-*]\s+", md, flags=re.MULTILINE)),
        tables_count=md.count("\n|"),
        word_count=len(md.split()),
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
