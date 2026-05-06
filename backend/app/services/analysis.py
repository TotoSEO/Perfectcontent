"""Claude semantic report from parsed competitors + related keywords + intent.

This step now also produces a per-competitor breakdown (angle / strength /
weakness) so the writer can position its article AGAINST a specific weak
spot, instead of producing an averaged-out copy of the SERP.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services import llm
from app.services.parser import ParsedPage

SYSTEM = """Analyste SEO sémantique senior, francophone. Tu analyses la SERP top 7
d'un mot-clé et tu produis un rapport JSON STRICT (pas de markdown, pas de prose).

Ton analyse doit être ACTIONNABLE et DIFFÉRENCIANTE : pas de banalités, que des
constats concrets qui orienteront la rédaction.

Schéma JSON (toutes les clés obligatoires) :
{
  "common_subthemes": [string],     // sous-thèmes traités par ≥ 5/7 concurrents
  "rare_subthemes": [string],       // sous-thèmes traités par 1-2 concurrents (différenciation)
  "entities": [string],             // entités nommées récurrentes (marques, normes, lieux, concepts)
  "required_terms": [string],       // 15-30 termes/expressions techniques à utiliser
  "content_gaps": [string],         // 3-5 angles MAL/PAS couverts qu'on peut exploiter
  "competitors": [                  // un objet PAR concurrent fourni, dans le même ordre
    {
      "rank": number,               // 1..N (rang SERP)
      "angle": string,               // angle dominant en 1-3 mots ("how-to", "comparatif", "essai", "guide débutant", "avis perso", "étude de cas")
      "strength": string,            // ce que le concurrent fait MIEUX que les autres (1 phrase concrète)
      "weakness": string             // sa faiblesse exploitable, en 1 phrase concrète (manque de chiffres, pas de FAQ, structure éclatée, ton scolaire, etc.)
    }
  ],
  "structural_signals": {
    "has_table": boolean,             // ≥ 3 concurrents ont un tableau
    "has_faq": boolean,               // ≥ 3 concurrents ont une FAQ
    "avg_words": number,
    "recommended_h2_count": number,
    "tone": string                    // "informatif" | "commercial" | "technique" | "pratique"
  }
}

Règles strictes :
- common_subthemes = sous-thèmes (ex "Avantages du modèle X"), pas mots isolés.
- content_gaps = opportunités CONCRÈTES, pas du wishful thinking.
- required_terms = pas le mot-clé évident, focus sur les termes techniques précis.
- competitors[i].weakness doit être actionnable ("ne donne aucun chiffre",
  "structure plate sans H3", "FAQ générique", "ton trop académique"), JAMAIS
  une généralité ("pourrait être plus complet").
"""

USER_TEMPLATE = """Mot-clé cible : {keyword}
Intent de recherche : {intent}

Mots-clés associés (top 30 DataForSEO) :
{related}

Concurrents top 7 (avec leur score de qualité 0-1, plus haut = mieux écrit) :
{competitors}

Analyse cette SERP et produis le JSON strict du schéma. Pas de markdown."""


@dataclass
class CompetitorBreakdown:
    rank: int
    angle: str
    strength: str
    weakness: str

    def to_dict(self) -> dict:
        return {"rank": self.rank, "angle": self.angle, "strength": self.strength, "weakness": self.weakness}


@dataclass
class SemanticReport:
    common_subthemes: list[str]
    rare_subthemes: list[str]
    entities: list[str]
    required_terms: list[str]
    content_gaps: list[str]
    structural_signals: dict[str, Any]
    competitors_breakdown: list[CompetitorBreakdown] = field(default_factory=list)
    llm_cost: float = 0.0


async def semantic_report(
    *,
    keyword: str,
    intent: str,
    parsed: list[tuple[ParsedPage, float]],
    related: list[str],
    capture: dict | None = None,
) -> SemanticReport:
    competitors_text = _format_competitors(parsed)
    related_text = ", ".join(related[:30]) if related else "(aucun)"
    user = USER_TEMPLATE.format(
        keyword=keyword,
        intent=intent,
        related=related_text,
        competitors=competitors_text,
    )
    resp = await llm.complete(
        system=SYSTEM, user=user, max_tokens=3500, temperature=0.3, model=llm.HAIKU
    )
    if capture is not None:
        capture.update(system=SYSTEM, user=user, model=llm.HAIKU, cost=resp.cost)
    data = llm.extract_json(resp.text)
    breakdown = []
    for c in data.get("competitors", []):
        if not isinstance(c, dict):
            continue
        breakdown.append(CompetitorBreakdown(
            rank=int(c.get("rank") or len(breakdown) + 1),
            angle=str(c.get("angle") or ""),
            strength=str(c.get("strength") or ""),
            weakness=str(c.get("weakness") or ""),
        ))
    return SemanticReport(
        common_subthemes=list(data.get("common_subthemes", [])),
        rare_subthemes=list(data.get("rare_subthemes", [])),
        entities=list(data.get("entities", [])),
        required_terms=list(data.get("required_terms", [])),
        content_gaps=list(data.get("content_gaps", [])),
        structural_signals=dict(data.get("structural_signals", {})),
        competitors_breakdown=breakdown,
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
