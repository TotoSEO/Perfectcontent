"""Claude-derived term targets — replaces BM25 maths with LLM proposals
counted against the real corpus.

Why this exists:
  The BM25-Okapi pass in `term_freq.py` is rigorous but blind to semantics.
  It can't tell that "cafetière à grain" and "machine à café à grain" are
  the same target, can't surface entity-anchored bigrams that don't pass the
  df>=2 gate, and produces noisy stems on french morphology. Claude reads
  the 7 competitor corpora and proposes 40 semantically-grounded terms
  with their surface variants — exactly the human SEO step a tool like
  YourTextGuru runs internally.

Why not let Claude count too:
  LLMs are unreliable on exact integer counts across long texts. So we
  split the work: Claude proposes terms + surface forms + importance;
  Python counts each surface form across docs with whole-word regex.

Cost (Haiku 4.5, ~9k input tokens after truncation, ~3k output):
  Input  9k tokens × $0.80/M = $0.0072
  Output 3k tokens × $4.00/M = $0.0120
  Total ≈ $0.02 per analysis.

Compatibility:
  Returns `list[TermTarget]` (same dataclass as `term_freq`) so the
  frontend SemanticChart / scoring code keeps working unchanged.
"""
from __future__ import annotations

import re
import statistics
import unicodedata
from collections import Counter
from typing import Any

from app.services import llm
from app.services.term_freq import TermTarget

# Hard caps for the corpus payload sent to Claude — keep input under ~10k tokens.
_PER_DOC_WORD_LIMIT = 1000
_MAX_TOTAL_DOCS = 7

SYSTEM = """\
Tu es un expert SEO francophone. Tu reçois les contenus des 7 premiers résultats Google sur un mot-clé.
Ton rôle : identifier exactement 40 termes que le rédacteur DOIT couvrir pour rivaliser sémantiquement avec ces concurrents.

Règles strictes :
1. Les termes doivent être ANCRÉS dans les corpus fournis — pas de termes inventés ou évidents.
2. Mélange d'unigrammes (un mot) et de n-grammes (2-3 mots). Privilégie les n-grammes pour les concepts distinctifs.
3. Chaque terme a une forme canonique (la plus naturelle, lemmatisée si pertinent) et des surface_forms : toutes les variantes morphologiques + synonymes proches qu'on trouverait en comptant dans le texte (singulier/pluriel, masc/fem, conjugaisons, variantes orthographiques courantes).
4. L'importance (0-1) reflète à quel point le terme est :
   - cité par plusieurs concurrents (couverture large = obligatoire)
   - distinctif du sujet (pas un mot générique type "article", "guide", "site web")
   - sémantiquement central (entité nommée, attribut clé, sous-thème porteur)
5. Exclure : stop-words, termes purement génériques ("important", "intéressant"), marques de concurrents, mentions d'auteurs, navigation, dates.
6. Inclure obligatoirement : entités nommées (marques produits, lieux, personnalités), termes techniques du domaine, variantes du mot-clé principal.

Réponds en JSON strict (pas de markdown, pas de commentaires) avec ce schéma exact :
{
  "terms": [
    {
      "term": "string (forme canonique d'affichage)",
      "surface_forms": ["string", ...],  // 1 à 8 variantes à compter dans le texte
      "is_ngram": bool,                  // true si le terme contient un espace
      "importance": float                // 0-1
    },
    ...
  ]
}
Exactement 40 entrées dans `terms`. Trie par importance décroissante.
"""

USER_TEMPLATE = """\
Mot-clé cible : {keyword}

Titres principaux observés sur les 7 résultats :
{headings}

Corpus des concurrents (tronqués à ~{per_doc} mots) :

{competitors}
"""


async def compute_via_claude(
    competitor_texts: list[str],
    *,
    keyword: str,
    headings_text: str = "",
    top_n: int = 40,
    model: str = llm.HAIKU,
) -> tuple[list[TermTarget], float]:
    """Returns (term_targets, claude_cost_usd). May raise on Claude failure —
    caller should fall back to BM25."""
    if not competitor_texts:
        return [], 0.0

    docs = [_truncate_words(t, _PER_DOC_WORD_LIMIT) for t in competitor_texts[:_MAX_TOTAL_DOCS]]

    competitors_block = "\n\n".join(
        f"### Concurrent {i+1}\n{t}" for i, t in enumerate(docs) if t.strip()
    )

    user = USER_TEMPLATE.format(
        keyword=keyword,
        headings=(headings_text or "(non fourni)")[:1500],
        per_doc=_PER_DOC_WORD_LIMIT,
        competitors=competitors_block,
    )

    resp = await llm.complete(
        system=SYSTEM, user=user, model=model, max_tokens=4000, temperature=0.2,
    )
    data = llm.extract_json(resp.text)
    proposals = data.get("terms") if isinstance(data, dict) else None
    if not isinstance(proposals, list) or not proposals:
        return [], resp.cost

    # Cap + sanitize
    cleaned: list[dict[str, Any]] = []
    seen_canon: set[str] = set()
    for p in proposals[: top_n * 2]:  # pull a few extra in case some get filtered
        if not isinstance(p, dict):
            continue
        term = (p.get("term") or "").strip()
        if not term or len(term) < 2:
            continue
        canon = _canonical_key(term)
        if canon in seen_canon:
            continue
        seen_canon.add(canon)
        surfaces = p.get("surface_forms") or [term]
        if not isinstance(surfaces, list):
            surfaces = [term]
        surfaces = [
            s.strip() for s in surfaces
            if isinstance(s, str) and 1 < len(s.strip()) <= 60
        ][:8]
        if not surfaces:
            surfaces = [term]
        try:
            importance = float(p.get("importance") or 0.5)
        except (TypeError, ValueError):
            importance = 0.5
        importance = max(0.0, min(1.0, importance))
        is_ngram = bool(p.get("is_ngram")) or (" " in term)
        cleaned.append({
            "term": term,
            "surface_forms": surfaces,
            "importance": importance,
            "is_ngram": is_ngram,
        })
        if len(cleaned) >= top_n:
            break

    if not cleaned:
        return [], resp.cost

    # Count occurrences per (term, doc) → derive target/min/max
    targets: list[TermTarget] = []
    for entry in cleaned:
        counts_per_doc = [
            _count_surfaces(doc, entry["surface_forms"])
            for doc in competitor_texts
        ]
        if not counts_per_doc:
            continue
        target = float(statistics.median(counts_per_doc))
        targets.append(TermTarget(
            term=entry["term"],
            target=target,
            min=min(counts_per_doc),
            max=max(counts_per_doc),
            importance=entry["importance"],
            is_ngram=entry["is_ngram"],
            surface_forms=entry["surface_forms"],
        ))

    # Renormalize importance to [0,1] within the kept set so the editor's
    # progress bars span the full range.
    if targets:
        max_imp = max(t.importance for t in targets) or 1.0
        for t in targets:
            t.importance = round(t.importance / max_imp, 4)

    targets.sort(key=lambda t: (-t.importance, -t.target, t.term))
    return targets, resp.cost


# ---------- helpers --------------------------------------------------------

_WORD_RE = re.compile(r"\b", flags=re.UNICODE)


def _truncate_words(text: str, limit: int) -> str:
    if not text:
        return ""
    words = text.split()
    if len(words) <= limit:
        return text
    return " ".join(words[:limit])


def _canonical_key(term: str) -> str:
    """Lowercase + strip accents for dedup only — doesn't affect display."""
    s = unicodedata.normalize("NFKD", term).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def _count_surfaces(text: str, surfaces: list[str]) -> int:
    """Whole-word, accent-insensitive, case-insensitive count of any surface
    form in `text`. Matches the JS counter in `frontend/lib/stopwords.ts`."""
    if not text or not surfaces:
        return 0
    haystack = _fold(text)
    total = 0
    for s in surfaces:
        needle = _fold(s).strip()
        if not needle:
            continue
        pattern = r"\b" + re.escape(needle) + r"\b"
        total += len(re.findall(pattern, haystack))
    return total


def _fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
