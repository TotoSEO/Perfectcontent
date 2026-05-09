"""HTML sanitiser for content sent to Claude.

When users paste content from a CMS / Word / Google Docs / a rendered web
page, the clipboard payload comes loaded with noise:
  - class / style / id / data-* attributes
  - <span style="..."> wrappers around every other word
  - Microsoft Office <o:p> / <w:WordDocument> tags
  - <font color="..."> inherited from old WYSIWYGs
  - empty <p></p> separators
  - inline event handlers (onclick, onmouseover) — even if benign here,
    sending them to the LLM is wasted tokens

We strip ALL of that and keep only the semantic skeleton:
  - h1-h6, p, ul/ol/li, blockquote, table/thead/tbody/tfoot/tr/td/th
  - a (href + title only), img (src + alt + title only)
  - strong, em, b, i, u, code, pre, br, hr
  - figure/figcaption (kept for image captions)

Result: a compact, deterministic HTML that Claude can integrate keywords
into without wasting attention on cosmetic noise, AND that the user can
copy-paste back into their CMS without dragging junk in.
"""
from __future__ import annotations

import re
from bs4 import BeautifulSoup, Tag


# Tags whose entire subtree is dropped (content + attributes).
_DROP_TAGS = {
    "script", "style", "noscript", "iframe", "frame", "frameset", "object",
    "embed", "applet", "form", "input", "button", "textarea", "select",
    "option", "meta", "link", "base", "head", "title",
    "svg", "canvas", "audio", "video", "source", "track",
    "nav", "aside", "footer", "header",
}

# Tags whose container is removed but children kept (transparent unwrap).
# Useful for cleaning up <span style=...> / <font> / <div> / <o:p> chrome
# inserted by various editors.
_UNWRAP_TAGS_BASE = {"font", "span", "div", "section", "article"}

# Allowed attribute set per tag. Anything not listed → dropped.
_ALLOW_ATTRS: dict[str, set[str]] = {
    "a": {"href", "title", "rel", "target"},
    "img": {"src", "alt", "title", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
    "table": set(),
    "thead": set(),
    "tbody": set(),
    "tfoot": set(),
    "tr": set(),
    "ol": {"start"},
    "ul": set(),
    "li": set(),
    "p": set(),
    "h1": set(),
    "h2": set(),
    "h3": set(),
    "h4": set(),
    "h5": set(),
    "h6": set(),
    "strong": set(),
    "b": set(),
    "em": set(),
    "i": set(),
    "u": set(),
    "code": set(),
    "pre": set(),
    "blockquote": {"cite"},
    "br": set(),
    "hr": set(),
    "figure": set(),
    "figcaption": set(),
    "mark": set(),
    "small": set(),
    "sub": set(),
    "sup": set(),
}


_MS_NAMESPACE_TAG_RE = re.compile(r"^[a-z]+:[a-z]", re.IGNORECASE)
# Patterns we strip wherever they appear (Office leftovers)
_MS_OFFICE_PATTERNS = [
    re.compile(r"<!--\[if[^\]]*\]>.*?<!\[endif\]-->", re.DOTALL | re.IGNORECASE),
    re.compile(r"<!\[if[^\]]*\]>.*?<!\[endif\]>", re.DOTALL | re.IGNORECASE),
    re.compile(r"\sclass=\"Mso[A-Za-z0-9]+\"", re.IGNORECASE),
    re.compile(r"<o:p[^>]*>.*?</o:p>", re.DOTALL | re.IGNORECASE),
    re.compile(r"<o:p[^>]*/?>", re.IGNORECASE),
]


def sanitize_html(raw: str) -> str:
    """Return a clean, attribute-stripped, semantic-only HTML version of
    `raw`. Idempotent: sanitize_html(sanitize_html(x)) == sanitize_html(x).

    If `raw` doesn't contain any HTML tags, it's returned as-is — the
    sanitiser is a no-op on plain text so the optimize tool stays usable
    for users who paste markdown / plain-text copy."""
    if not raw or not raw.strip():
        return raw or ""
    if "<" not in raw:
        return raw

    # 1. Strip Office conditional comments + namespace tags BEFORE parsing
    cleaned = raw
    for pat in _MS_OFFICE_PATTERNS:
        cleaned = pat.sub("", cleaned)

    soup = BeautifulSoup(cleaned, "html.parser")

    # 2. Drop disallowed tags (subtree included)
    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        name = (tag.name or "").lower()
        # Microsoft / VML namespaced tags (o:p, w:WordDocument, v:shape, …)
        if _MS_NAMESPACE_TAG_RE.match(name):
            tag.decompose()
            continue
        if name in _DROP_TAGS:
            tag.decompose()
            continue

    # 3. Strip ALL attributes except the allow-listed ones; for completely
    # unknown tags, drop the tag's container while keeping its children.
    for tag in list(soup.find_all(True)):
        if not isinstance(tag, Tag):
            continue
        # The tag may have been decomposed already by an ancestor pass
        if tag.parent is None and tag is not soup:
            continue
        name = (tag.name or "").lower()
        if name in _ALLOW_ATTRS:
            allowed = _ALLOW_ATTRS[name]
            tag.attrs = {
                k.lower(): v
                for k, v in tag.attrs.items()
                if k.lower() in allowed
            }
            # Strip dangerous href/src protocols
            if name == "a":
                _sanitize_url(tag, "href")
            elif name == "img":
                _sanitize_url(tag, "src")
        else:
            # Unknown / cosmetic tag → unwrap (keep children, drop self)
            tag.unwrap()

    # 4. Re-pass to remove now-empty paragraph/list-item containers + bare
    # cosmetic wrappers (a second sweep catches the spans we just unwrapped
    # whose parents may now be empty).
    for tag in list(soup.find_all(["p", "li"])):
        if not isinstance(tag, Tag):
            continue
        if not tag.get_text(strip=True) and not tag.find(["img", "br"]):
            tag.decompose()

    # 5. Collapse runs of whitespace introduced by tag stripping
    out = str(soup)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r"[ \t]{3,}", " ", out)
    return out.strip()


def _sanitize_url(tag: Tag, attr: str) -> None:
    """Drop javascript:/vbscript:/data: URLs from links and images."""
    val = tag.get(attr)
    if not val or not isinstance(val, str):
        return
    lowered = val.strip().lower()
    if lowered.startswith(("javascript:", "vbscript:", "file:")):
        del tag[attr]
        return
    # data: URLs in <img src> are usually inline base64 — they bloat the
    # prompt sent to Claude. Drop the src; the alt text is enough for
    # Claude to keep the image reference.
    if attr == "src" and lowered.startswith("data:"):
        del tag[attr]
