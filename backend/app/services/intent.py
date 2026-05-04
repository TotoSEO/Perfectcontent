"""Classify search intent from SERP features and top results."""
from __future__ import annotations

from typing import Literal

Intent = Literal["informational", "commercial", "transactional", "navigational"]


def classify_intent(serp_features: list[str], top_titles: list[str]) -> Intent:
    features = set(serp_features)
    titles = " ".join(t.lower() for t in top_titles if t)

    if "shopping" in features or "ads" in features:
        if any(w in titles for w in ("acheter", "buy", "prix", "shop", "commander")):
            return "transactional"
        return "commercial"

    if any(w in titles for w in ("acheter", "buy", "prix bas", "commander", "réserver")):
        return "transactional"

    commercial_signals = ("meilleur", "top", "comparatif", "best", "vs", "avis", "review")
    if any(w in titles for w in commercial_signals):
        return "commercial"

    if "people_also_ask" in features or "featured_snippet" in features:
        return "informational"

    if "knowledge_graph" in features:
        return "navigational"

    return "informational"
