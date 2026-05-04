"""Compute the top corpus-level term frequencies from competitor texts.

Used to drive the YourTextGuru-style semantic score: target frequencies,
min/max ranges from the competitor distribution, ranked by importance.
"""
from __future__ import annotations

import re
import statistics
import unicodedata
from collections import Counter
from dataclasses import dataclass

# French + English stop words. Kept inline so the same list can be mirrored
# in TS for live frontend tokenization (see frontend/lib/stopwords.ts).
STOPWORDS_FR = {
    "a", "à", "ai", "ait", "as", "au", "aux", "avec", "avoir", "ce", "ces",
    "cet", "cette", "ceux", "ci", "comme", "d", "dans", "de", "des", "donc",
    "du", "elle", "elles", "en", "entre", "es", "est", "et", "été", "être",
    "eu", "il", "ils", "j", "je", "l", "la", "le", "les", "leur", "leurs",
    "lui", "m", "ma", "mais", "me", "mes", "mon", "n", "ne", "ni", "nos",
    "notre", "nous", "on", "ont", "ou", "où", "par", "pas", "plus", "pour",
    "près", "puis", "qu", "quand", "que", "quel", "quelle", "quelles", "quels",
    "qui", "quoi", "s", "sa", "sans", "se", "sera", "ses", "si", "soit",
    "son", "sont", "sous", "soyons", "sur", "t", "ta", "te", "tes", "toi",
    "ton", "tous", "tout", "toute", "toutes", "tu", "un", "une", "vos", "votre",
    "vous", "y", "été", "étée", "étées", "étés", "étant", "j'", "n'", "l'",
    "d'", "qu'", "s'", "m'", "t'", "c'", "jusqu",
    # numerals as words
    "deux", "trois", "quatre", "cinq", "dix",
    # very common verbs
    "fait", "faire", "fais", "faut", "peut", "peuvent", "peux", "doit", "doivent",
    "doivent", "veut", "veux", "veulent", "voir", "vu", "voit",
    # filler
    "très", "bien", "même", "déjà", "alors", "encore", "aussi", "ainsi", "puisque",
    "lorsque", "lorsqu", "tandis", "depuis", "vers", "chez", "selon", "afin",
    "non", "oui",
}
STOPWORDS_EN = {
    "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was", "were",
    "be", "been", "being", "by", "for", "with", "as", "it", "this", "that",
    "these", "those", "from", "at", "on", "but", "not", "can", "will", "do",
    "does", "did", "have", "has", "had", "you", "your", "we", "our", "they",
    "their", "i", "my", "me", "if", "than", "then", "so", "too", "very",
    "just", "more", "most", "other", "some", "such", "no", "nor", "only",
    "own", "same", "should", "now", "also", "any", "all", "each", "few",
    "into", "out", "up", "down", "off", "over", "under", "again", "further",
    "while", "after", "before", "between", "during", "above", "below",
    "about", "against", "between",
}

WORD_RE = re.compile(
    r"[a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ][a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ\-']*",
)
MIN_WORD_LEN = 3


@dataclass
class TermTarget:
    term: str
    target: float        # median frequency across competitors
    min: int             # min frequency observed (>=0)
    max: int             # max frequency observed
    importance: float    # 0..1 — combines coverage + magnitude

    def to_dict(self) -> dict:
        return {
            "term": self.term,
            "target": round(self.target, 2),
            "min": self.min,
            "max": self.max,
            "importance": round(self.importance, 4),
        }


def tokenize(text: str, stopwords: set[str] | None = None) -> list[str]:
    """Lowercase, strip accents-preserving tokens, drop stop words and short tokens."""
    sw = stopwords if stopwords is not None else (STOPWORDS_FR | STOPWORDS_EN)
    out: list[str] = []
    for match in WORD_RE.finditer(text):
        w = match.group(0).lower().strip("-'")
        if len(w) < MIN_WORD_LEN:
            continue
        if w in sw:
            continue
        if _normalize(w) in sw:
            continue
        out.append(w)
    return out


def _normalize(w: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn"
    )


def compute_term_targets(
    competitor_texts: list[str],
    *,
    top_n: int = 40,
) -> list[TermTarget]:
    """Aggregate term frequencies across competitor docs and rank.

    Importance ranking combines:
    - coverage: how many competitors use the term (favours universal terms)
    - magnitude: median frequency (favours terms used a lot, not just once)
    """
    if not competitor_texts:
        return []

    per_doc_counts: list[Counter[str]] = [
        Counter(tokenize(t)) for t in competitor_texts if t
    ]
    if not per_doc_counts:
        return []

    n_docs = len(per_doc_counts)
    all_terms: set[str] = set()
    for c in per_doc_counts:
        all_terms.update(c.keys())

    targets: list[TermTarget] = []
    for term in all_terms:
        per_doc = [c.get(term, 0) for c in per_doc_counts]
        coverage = sum(1 for n in per_doc if n > 0) / n_docs
        if coverage < 0.4:
            # require at least 40% of competitors to use the term
            continue
        median_freq = statistics.median(per_doc)
        if median_freq < 1:
            continue
        importance = coverage * (1 + (median_freq / 10))
        targets.append(
            TermTarget(
                term=term,
                target=median_freq,
                min=min(per_doc),
                max=max(per_doc),
                importance=importance,
            )
        )

    targets.sort(key=lambda t: (-t.importance, -t.target, t.term))
    # Re-normalize importance to 0..1 within the kept top
    top = targets[:top_n]
    if top:
        max_imp = top[0].importance or 1.0
        for t in top:
            t.importance = t.importance / max_imp if max_imp else 0.0
    return top
