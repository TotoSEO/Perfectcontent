"""Score competitors 0-1: longueur, fraîcheur, auteur, schema. Used to weight analysis."""
from __future__ import annotations

from datetime import datetime, timezone

from app.services.parser import ParsedPage


def score_competitor(parsed: ParsedPage) -> float:
    score = 0.0
    # Length (cap at 2000 words for full credit)
    score += min(parsed.word_count / 2000.0, 1.0) * 0.35
    # Structure
    score += min(len(parsed.h2) / 6.0, 1.0) * 0.20
    if parsed.tables_count > 0:
        score += 0.05
    # Schema markup
    if parsed.has_article_schema or parsed.has_product_schema or parsed.has_faq_schema:
        score += 0.10
    # Authorship
    if parsed.author:
        score += 0.10
    # Freshness (within 2 years)
    if parsed.published_at is not None:
        age_days = (datetime.now(timezone.utc) - parsed.published_at).days
        if age_days < 365:
            score += 0.20
        elif age_days < 730:
            score += 0.10
    return round(min(score, 1.0), 3)
