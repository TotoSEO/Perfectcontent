"""Parse a Google Search Console CSV export.

GSC offers two main exports we want to support:
  1. "Top queries" CSV — already filtered to a single page in the GSC UI.
     Columns: Query (or "Top queries"), Clicks, Impressions, CTR, Position.
  2. The same exported as Excel — sometimes the encoding is UTF-16 with a
     BOM, sometimes UTF-8 with semicolon separators.

We sniff the dialect, normalise the column names, parse percentages/floats
and return a clean list of GscRow dataclasses sorted by impressions desc.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass


@dataclass
class GscRow:
    query: str
    clicks: int
    impressions: int
    ctr: float        # 0..1
    position: float


_HEADER_ALIASES: dict[str, str] = {
    # query
    "query": "query",
    "queries": "query",
    "top queries": "query",
    "search query": "query",
    "requête": "query",
    "requêtes": "query",
    "requêtes les plus fréquentes": "query",
    # clicks
    "clicks": "clicks",
    "click": "clicks",
    "top clicks": "clicks",
    "clics": "clicks",
    # impressions
    "impressions": "impressions",
    "impression": "impressions",
    # ctr
    "ctr": "ctr",
    "click-through rate": "ctr",
    # position
    "position": "position",
    "average position": "position",
    "avg position": "position",
    "position moyenne": "position",
}


def _decode(raw: bytes) -> str:
    """GSC exports come in different encodings. UTF-16 BOM is the most
    common; fall back to UTF-8 then latin-1."""
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16")
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace")


def _detect_dialect(sample: str) -> csv.Dialect:
    try:
        d = csv.Sniffer().sniff(sample, delimiters=",;\t")
        return d
    except csv.Error:
        # Default to comma
        class _D(csv.Dialect):
            delimiter = ","
            quotechar = '"'
            doublequote = True
            skipinitialspace = True
            lineterminator = "\n"
            quoting = csv.QUOTE_MINIMAL

        return _D()


_PCT_RE = re.compile(r"^\s*([\d.,]+)\s*%?\s*$")


def _to_float(v: str | None) -> float:
    if v is None:
        return 0.0
    s = v.strip().replace("\xa0", " ").replace(" ", "")
    if not s:
        return 0.0
    # Accept "1,5%" and "1.5%" and "0.015"
    m = _PCT_RE.match(s)
    if m:
        num = m.group(1).replace(",", ".")
        try:
            f = float(num)
        except ValueError:
            return 0.0
        if "%" in s:
            f /= 100.0
        return f
    # Plain number with comma decimals
    s2 = s.replace(",", ".")
    try:
        return float(s2)
    except ValueError:
        return 0.0


def _to_int(v: str | None) -> int:
    return int(round(_to_float(v)))


def parse_gsc_csv(raw: bytes) -> list[GscRow]:
    """Parse a GSC CSV export into normalised rows.

    Tolerant: skips rows missing required fields, accepts French / English
    headers, accepts percentage formats for CTR.
    """
    text = _decode(raw)
    if not text.strip():
        return []

    sample = text[:4096]
    dialect = _detect_dialect(sample)
    reader = csv.reader(io.StringIO(text), dialect=dialect)

    header_row: list[str] | None = None
    rows: list[GscRow] = []

    for row in reader:
        if not row or all(not c.strip() for c in row):
            continue
        if header_row is None:
            header_row = [_normalize_header(c) for c in row]
            # Validate at least query + impressions present
            if "query" not in header_row or "impressions" not in header_row:
                # Try one more row in case of preamble
                continue
            continue
        if len(row) < len(header_row):
            row = row + [""] * (len(header_row) - len(row))
        record = dict(zip(header_row, row))
        q = (record.get("query") or "").strip()
        if not q:
            continue
        rows.append(
            GscRow(
                query=q,
                clicks=_to_int(record.get("clicks")),
                impressions=_to_int(record.get("impressions")),
                ctr=_to_float(record.get("ctr")),
                position=_to_float(record.get("position")) or 100.0,
            )
        )

    rows.sort(key=lambda r: -r.impressions)
    return rows


def _normalize_header(h: str) -> str:
    key = h.strip().lower().lstrip("﻿")
    return _HEADER_ALIASES.get(key, key)
