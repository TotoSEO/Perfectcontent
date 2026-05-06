"""Build/regenerate the editorial Blueprint from the semantic report."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services import llm
from app.services.analysis import SemanticReport

SYSTEM = """Stratège SEO éditorial senior. Tu produis un blueprint en JSON STRICT
(pas de markdown, pas de prose). Doit être assez précis pour qu'un rédacteur
produise du top-niveau du 1er coup.

Schéma :
{
  "title_target": string,    // 50-60 car, accroche, mot-clé en début
  "angle": string,           // angle différenciant en 1-2 phrases concrètes
  "target_words": number,    // cible mots, calibrée sur avg_words concurrents
  "tone": string,            // 1-2 mots ("pratique direct", "expertise sobre")
  "sections": [{
    "id": string,            // slug court ("intro","comparatif","faq")
    "h2": string,            // H2 final, clair, zéro clickbait
    "purpose": string,       // 1 phrase : ce que le lecteur absorbe ici
    "bullets": [string],     // 3-6 points concrets (PAS des H3)
    "element": "table"|"faq"|"list"|"callout"|null,
    "must_terms": [string]   // required_terms à couvrir ici
  }],
  "schema_recommendations": [string]   // ["Article","FAQPage","Product"...]
}

Règles :
- Pas de "Introduction" générique : 1ère section avec nom utile.
- Pas de "Conclusion" creuse : finir par synthèse pratique (À retenir, FAQ,
  Comment choisir).
- Selon content_type :
  • blog : 5-8 sections, FAQ avant-dernier, tableau si comparaison.
  • category : intro courte + critères de choix + comparatif tabulé + FAQ.
  • product : bénéfices listés + carac tabulées + FAQ courte (3-4 Q).
  • service_lp : promesse + bénéfices structurés + processus/preuves + FAQ
    (pas de section "CTA").
- 3-6 bullets concrets/section, pas de sous-titres H3.
- must_terms : répartis-les pour que TOUS les required_terms soient couverts
  au moins 1x à travers les sections.
"""

USER_TEMPLATE = """Mot-clé cible : {keyword}
Intent : {intent}
Type de contenu : {content_type}

Rapport sémantique (signaux SERP) :
{report}

Top 30 termes à fréquence-cible (pour répartir dans must_terms) :
{term_targets}

Construis le blueprint en JSON strict. Pas de markdown.
"""


@dataclass
class Blueprint:
    title_target: str
    angle: str
    target_words: int
    sections: list[dict[str, Any]]
    schema_recommendations: list[str]
    tone: str
    llm_cost: float

    def to_dict(self) -> dict:
        return {
            "title_target": self.title_target,
            "angle": self.angle,
            "target_words": self.target_words,
            "tone": self.tone,
            "sections": self.sections,
            "schema_recommendations": self.schema_recommendations,
        }


async def build_blueprint(
    *,
    keyword: str,
    intent: str,
    content_type: str,
    report: SemanticReport,
    term_targets: list[dict] | None = None,
    capture: dict | None = None,
) -> Blueprint:
    targets_text = (
        ", ".join(f"{t.get('term')} (~{t.get('target')})" for t in (term_targets or [])[:30])
        if term_targets
        else "(non disponibles)"
    )
    user = USER_TEMPLATE.format(
        keyword=keyword,
        intent=intent,
        content_type=content_type,
        report=json.dumps(
            {
                "common_subthemes": report.common_subthemes,
                "rare_subthemes": report.rare_subthemes,
                "entities": report.entities,
                "required_terms": report.required_terms,
                "content_gaps": report.content_gaps,
                "structural_signals": report.structural_signals,
            },
            ensure_ascii=False,
            indent=2,
        ),
        term_targets=targets_text,
    )
    resp = await llm.complete(
        system=SYSTEM, user=user, max_tokens=4000, temperature=0.4, model=llm.HAIKU
    )
    if capture is not None:
        capture.update(system=SYSTEM, user=user, model=llm.HAIKU, cost=resp.cost)
    data = llm.extract_json(resp.text)
    return Blueprint(
        title_target=data.get("title_target", ""),
        angle=data.get("angle", ""),
        target_words=int(data.get("target_words", 1500)),
        tone=str(data.get("tone", "")),
        sections=list(data.get("sections", [])),
        schema_recommendations=list(data.get("schema_recommendations", [])),
        llm_cost=resp.cost,
    )
