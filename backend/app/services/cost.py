"""Coût pré-flight : fourchette low/high par type d'opération.

Coûts unitaires (USD). À ajuster si les tarifs APIs changent.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ContentType = Literal["blog", "category", "product", "service_lp"]

# Per-step rough estimates (low, high)
SERP_LOW, SERP_HIGH = 0.014, 0.020
SCRAPE_LOW, SCRAPE_HIGH = 0.005, 0.012  # 7 URLs Firecrawl
IMAGE_LOW, IMAGE_HIGH = 0.025, 0.040    # OpenAI gpt-image-1 1024x1024 (opt-in)
LINKING_LOW, LINKING_HIGH = 0.005, 0.020

# Claude analysis + generation (depends on competitor length + output length)
CLAUDE_BY_TYPE: dict[ContentType, tuple[float, float]] = {
    "blog": (0.12, 0.28),
    "category": (0.08, 0.18),
    "product": (0.06, 0.15),
    "service_lp": (0.10, 0.22),
}


@dataclass
class CostRange:
    low: float
    high: float


def estimate(
    *,
    content_type: ContentType,
    internal_linking: bool = False,
    generate_image: bool = False,
) -> CostRange:
    claude_low, claude_high = CLAUDE_BY_TYPE[content_type]
    low = SERP_LOW + SCRAPE_LOW + claude_low
    high = SERP_HIGH + SCRAPE_HIGH + claude_high
    if internal_linking:
        low += LINKING_LOW
        high += LINKING_HIGH
    if generate_image:
        low += IMAGE_LOW
        high += IMAGE_HIGH
    return CostRange(low=round(low, 4), high=round(high, 4))


def domain_index_estimate(pages_count: int) -> CostRange:
    scrape = pages_count * 0.001
    embed = pages_count * 0.00002
    total = scrape + embed
    return CostRange(low=round(total * 0.7, 4), high=round(total * 1.3, 4))


# ---------- Token-based LLM cost estimates ----------
SONNET_INPUT = 3.00      # USD per 1M input tokens
SONNET_OUTPUT = 15.00    # USD per 1M output tokens
CHARS_PER_TOKEN = 4.0    # rough average for FR + HTML mix

# System prompt sizes (chars). Re-measure if prompts change.
FUSION_SYSTEM_CHARS = 3500
REWRITE_SYSTEM_CHARS = 3200


def _claude_cost(input_tokens: int, output_tokens: int) -> float:
    return round(
        input_tokens / 1_000_000 * SONNET_INPUT
        + output_tokens / 1_000_000 * SONNET_OUTPUT,
        4,
    )


def estimate_fusion(sources: list[str]) -> CostRange:
    sources_chars = sum(len(s or "") for s in sources)
    input_chars = FUSION_SYSTEM_CHARS + sources_chars + 500
    input_tokens = int(input_chars / CHARS_PER_TOKEN)
    longest = max((len(s or "") for s in sources), default=0)
    output_low = int(longest * 0.6 / CHARS_PER_TOKEN)
    output_high = int(longest * 1.0 / CHARS_PER_TOKEN)
    return CostRange(
        low=_claude_cost(input_tokens, output_low),
        high=_claude_cost(input_tokens, output_high),
    )


def estimate_rewrite(source_chars: int, *, internal_linking: bool = False) -> CostRange:
    # Pipeline phases that always run for a rewrite job
    base_low = SERP_LOW + SCRAPE_LOW + 0.05
    base_high = SERP_HIGH + SCRAPE_HIGH + 0.10

    input_chars = REWRITE_SYSTEM_CHARS + source_chars + 1500
    input_tokens = int(input_chars / CHARS_PER_TOKEN)
    output_low = int(source_chars * 0.92 / CHARS_PER_TOKEN)
    output_high = int(source_chars * 1.4 / CHARS_PER_TOKEN)
    rewrite_low = _claude_cost(input_tokens, output_low)
    rewrite_high = _claude_cost(input_tokens, output_high)

    low = base_low + rewrite_low
    high = base_high + rewrite_high
    if internal_linking:
        low += LINKING_LOW
        high += LINKING_HIGH
    return CostRange(low=round(low, 4), high=round(high, 4))
