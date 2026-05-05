"""Claude semantic report from parsed competitors + related keywords + intent."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services import llm
from app.services.parser import ParsedPage

SYSTEM = """Tu es un analyste SEO sémantique senior, francophone. Tu analyses la SERP \
top 7 d'un mot-clé et tu produis un rapport structuré au format JSON STRICT \
(pas de markdown autour, pas de prose).

Ton analyse doit être actionnable et différenciante : pas de banalités, des \
constats concrets qui orienteront la rédaction.

Schéma JSON attendu (toutes les clés obligatoires) :
{
  "common_subthemes": [string],     // sous-thèmes traités par ≥ 5/7 concurrents
  "rare_subthemes": [string],       // sous-thèmes traités par 1-2 concurrents (différenciation)
  "entities": [string],             // entités nommées récurrentes (marques, normes, lieux, concepts clés)
  "required_terms": [string],       // 15-30 termes/expressions techniques à utiliser
  "content_gaps": [string],         // 3-5 angles MAL ou PAS couverts qu'on peut exploiter
  "structural_signals": {
    "has_table": boolean,           // ≥ 3 concurrents ont un tableau ?
    "has_faq": boolean,             // ≥ 3 concurrents ont une FAQ ?
    "avg_words": number,            // moyenne de mots des 7 concurrents
    "recommended_h2_count": number, // nombre optimal de H2
    "tone": string                  // "informatif" | "commercial" | "technique" | "pratique"
  }
}

Règles strictes :
- Les common_subthemes doivent être des sous-thèmes (genre "Avantages du modèle X"),
  pas des mots isolés.
- Les content_gaps doivent être des opportunités CONCRÈTES, pas du wishful thinking.
- required_terms : pas de mots-clés évidents (le mot-clé principal et ses variantes simples
  ne comptent pas), focus sur les termes techniques précis.
"""

USER_TEMPLATE = """Mot-clé cible : {keyword}
Intent de recherche : {intent}

Mots-clés associés (top 30 DataForSEO) :
{related}

Concurrents top 7 (avec leur score de qualité 0-1, plus haut = mieux écrit) :
{competitors}

Analyse cette SERP et produis le JSON strict du schéma. Pas de markdown."""


@dataclass
class SemanticReport:
    common_subthemes: list[str]
    rare_subthemes: list[str]
    entities: list[str]
    required_terms: list[str]
    content_gaps: list[str]
    structural_signals: dict[str, Any]
    llm_cost: float


async def semantic_report(
    *,
    keyword: str,
    intent: str,
    parsed: list[tuple[ParsedPage, float]],
    related: list[str],
) -> SemanticReport:
    competitors_text = _format_competitors(parsed)
    related_text = ", ".join(related[:30]) if related else "(aucun)"
    user = USER_TEMPLATE.format(
        keyword=keyword,
        intent=intent,
        related=related_text,
        competitors=competitors_text,
    )
    resp = await llm.complete(system=SYSTEM, user=user, max_tokens=2500, temperature=0.3)
    data = llm.extract_json(resp.text)
    return SemanticReport(
        common_subthemes=list(data.get("common_subthemes", [])),
        rare_subthemes=list(data.get("rare_subthemes", [])),
        entities=list(data.get("entities", [])),
        required_terms=list(data.get("required_terms", [])),
        content_gaps=list(data.get("content_gaps", [])),
        structural_signals=dict(data.get("structural_signals", {})),
        llm_cost=resp.cost,
    )


def _format_competitors(parsed: list[tuple[ParsedPage, float]]) -> str:
    blocks = []
    for i, (p, q) in enumerate(parsed, 1):
        blocks.append(
            f"### Concurrent {i} (qualité={q})\n"
            f"URL : {p.url}\n"
            f"Title : {p.title}\n"
            f"H1 : {p.h1}\n"
            f"H2 : {p.h2[:12]}\n"
            f"H3 (échantillon) : {p.h3[:12]}\n"
            f"Mots : {p.word_count} | tableaux : {p.tables_count} | listes : {p.lists_count} | "
            f"FAQ schema : {p.has_faq_schema} | article schema : {p.has_article_schema}\n"
            f"Extrait paragraphes : {' / '.join(p.paragraphs[:3])[:1500]}"
        )
    return "\n\n".join(blocks)
