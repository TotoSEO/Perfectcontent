"""Coût pré-flight : fourchette low/high par type de contenu et options.

Coûts unitaires (USD) — ajuster si tarifs APIs changent.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ContentType = Literal["blog", "category", "product", "service_lp"]

# Per-step rough estimates (low, high)
SERP_LOW, SERP_HIGH = 0.014, 0.020
SCRAPE_LOW, SCRAPE_HIGH = 0.005, 0.012  # 7 URLs Firecrawl
IMAGE_LOW, IMAGE_HIGH = 0.025, 0.035

# Claude analysis + generation (depends on competitor length + output length)
CLAUDE_BY_TYPE: dict[ContentType, tuple[float, float]] = {
    "blog": (0.12, 0.28),
    "category": (0.08, 0.18),
    "product": (0.06, 0.15),
    "service_lp": (0.10, 0.22),
}

LINKING_LOW, LINKING_HIGH = 0.005, 0.020  # embeddings + Claude validation


@dataclass
class CostRange:
    low: float
    high: float


def estimate(*, content_type: ContentType, internal_linking: bool) -> CostRange:
    claude_low, claude_high = CLAUDE_BY_TYPE[content_type]
    low = SERP_LOW + SCRAPE_LOW + claude_low + IMAGE_LOW
    high = SERP_HIGH + SCRAPE_HIGH + claude_high + IMAGE_HIGH
    if internal_linking:
        low += LINKING_LOW
        high += LINKING_HIGH
    return CostRange(low=round(low, 4), high=round(high, 4))


def domain_index_estimate(pages_count: int) -> CostRange:
    """Rough cost to index N pages: Firecrawl + embeddings."""
    scrape = pages_count * 0.001  # firecrawl ~$1/1000
    embed = pages_count * 0.00002  # text-embedding-3-small ~$0.02/M tokens
    total = scrape + embed
    return CostRange(low=round(total * 0.7, 4), high=round(total * 1.3, 4))
