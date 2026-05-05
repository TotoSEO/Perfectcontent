"""Sitemap discovery: robots.txt → sitemap → recursive expansion.

Uses stdlib xml.etree.ElementTree (no lxml) to keep the Vercel function
under the 250 MB unzipped cap.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import httpx

FALLBACK_PATHS = ("/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml")
MAX_URLS_PER_DOMAIN = 5000
MAX_DEPTH = 4


async def discover_sitemaps(hostname: str) -> list[str]:
    base = _base_url(hostname)
    sitemaps: list[str] = []
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        try:
            r = await client.get(f"{base}/robots.txt")
            if r.status_code == 200:
                sitemaps.extend(_parse_robots(r.text))
        except httpx.HTTPError:
            pass

        if not sitemaps:
            for path in FALLBACK_PATHS:
                try:
                    r = await client.head(f"{base}{path}")
                    if r.status_code < 400:
                        sitemaps.append(f"{base}{path}")
                        break
                except httpx.HTTPError:
                    continue
    return _dedupe(sitemaps)


def _localname(tag: str) -> str:
    """Strip XML namespace from a tag name. ElementTree returns '{ns}name'."""
    return tag.rsplit("}", 1)[-1].lower() if "}" in tag else tag.lower()


async def expand_sitemap(url: str, *, depth: int = 0) -> list[str]:
    if depth > MAX_DEPTH:
        return []
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            content = r.content
    except httpx.HTTPError:
        return []

    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return []
    if root is None:
        return []

    tag = _localname(root.tag)
    if tag == "sitemapindex":
        children: list[str] = []
        for loc in root.iter():
            if _localname(loc.tag) != "loc":
                continue
            child_url = (loc.text or "").strip()
            if child_url:
                children.extend(await expand_sitemap(child_url, depth=depth + 1))
            if len(children) >= MAX_URLS_PER_DOMAIN:
                break
        return children[:MAX_URLS_PER_DOMAIN]
    if tag == "urlset":
        urls: list[str] = []
        for loc in root.iter():
            if _localname(loc.tag) != "loc":
                continue
            u = (loc.text or "").strip()
            if u:
                urls.append(u)
            if len(urls) >= MAX_URLS_PER_DOMAIN:
                break
        return urls
    return []


async def discover_all_urls(hostname: str) -> list[str]:
    sitemaps = await discover_sitemaps(hostname)
    seen: set[str] = set()
    urls: list[str] = []
    for sm in sitemaps:
        for u in await expand_sitemap(sm):
            if u in seen:
                continue
            seen.add(u)
            urls.append(u)
            if len(urls) >= MAX_URLS_PER_DOMAIN:
                return urls
    return urls


def _parse_robots(text: str) -> list[str]:
    sitemaps = []
    for line in text.splitlines():
        m = re.match(r"\s*sitemap\s*:\s*(\S+)\s*$", line, flags=re.IGNORECASE)
        if m:
            sitemaps.append(m.group(1))
    return sitemaps


def _base_url(hostname: str) -> str:
    h = hostname.strip().lower()
    if h.startswith(("http://", "https://")):
        parsed = urlparse(h)
        return f"{parsed.scheme}://{parsed.netloc}"
    return f"https://{h}"


def _dedupe(urls: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out
