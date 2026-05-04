"""Claude semantic report from parsed competitors + related keywords + intent."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services import llm
from app.services.parser import ParsedPage

SYSTEM = """Tu es un analyste SEO sémantique. À partir de la SERP top 7 d'un mot-clé donné,
tu produis un rapport d'analyse structuré au format JSON strict (pas de markdown autour).

Tu dois identifier :
- common_subthemes: sous-thèmes traités par la majorité des concurrents (signal fort)
- rare_subthemes: sous-thèmes traités par 1-2 concurrents seulement (différenciation possible)
- entities: entités nommées récurrentes (marques, lieux, normes, concepts)
- required_terms: termes/expressions à intégrer pour la couverture sémantique
- content_gaps: angles peu ou pas couverts qu'on peut exploiter
- structural_signals: { has_table, has_faq, avg_words, recommended_h2_count }
"""

USER_TEMPLATE = """Mot-clé: {keyword}
Intent: {intent}

Mots-clés associés (DataForSEO related): {related}

Concurrents top 7 (avec score qualité 0-1) :
{competitors}

Réponds en JSON strict suivant le schéma ci-dessus. Pas de markdown, pas de prose autour du JSON."""


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
    related_text = ", ".join(related[:30]) if related else "(none)"
    user = USER_TEMPLATE.format(
        keyword=keyword,
        intent=intent,
        related=related_text,
        competitors=competitors_text,
    )
    resp = await llm.complete(system=SYSTEM, user=user, max_tokens=2500)
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
            f"URL: {p.url}\n"
            f"Title: {p.title}\n"
            f"H1: {p.h1}\n"
            f"H2: {p.h2[:10]}\n"
            f"H3 (sample): {p.h3[:10]}\n"
            f"Mots: {p.word_count} | tableaux: {p.tables_count} | listes: {p.lists_count} | "
            f"FAQ schema: {p.has_faq_schema} | article schema: {p.has_article_schema}\n"
            f"Extrait paragraphes: {' / '.join(p.paragraphs[:3])[:1200]}"
        )
    return "\n\n".join(blocks)
