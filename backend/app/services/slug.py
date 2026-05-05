"""Deterministic French slugifier for SEO URLs.

- lowercase, no accents
- drops a small set of obvious filler stopwords (de, du, la, le, les, des, à, en, et, …)
  but keeps domain content words intact
- collapses any non-alphanumeric run to a single hyphen
- caps at ~60 chars on the final token boundary
"""
from __future__ import annotations

import re
import unicodedata

_FILLER = {
    "de", "du", "des", "le", "la", "les", "l", "un", "une", "et", "ou", "à",
    "a", "au", "aux", "en", "dans", "sur", "pour", "par", "avec", "sans",
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for",
}
_MAX_LEN = 60


def slugify(text: str, *, max_len: int = _MAX_LEN) -> str:
    if not text:
        return ""
    # Strip accents
    nfd = unicodedata.normalize("NFD", text)
    ascii_only = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    # Lowercase + non-alnum -> spaces
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", ascii_only.lower()).strip()
    if not cleaned:
        return ""
    tokens = [t for t in cleaned.split(" ") if t and t not in _FILLER]
    if not tokens:
        # All tokens were filler — fall back to keep raw words
        tokens = cleaned.split(" ")
    slug = "-".join(tokens)
    if len(slug) <= max_len:
        return slug
    # Truncate on a token boundary
    cut = slug[:max_len].rsplit("-", 1)[0]
    return cut or slug[:max_len]


def join_url(base_url: str, slug: str, *, trailing_slash: bool = False) -> str:
    base = base_url.rstrip("/") + "/"
    out = base + slug.lstrip("/")
    if trailing_slash and not out.endswith("/"):
        out += "/"
    return out
