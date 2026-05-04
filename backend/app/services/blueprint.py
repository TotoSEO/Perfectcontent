"""Build/regenerate the editorial Blueprint from the semantic report."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services import llm
from app.services.analysis import SemanticReport

SYSTEM = """Tu es un stratège SEO éditorial. Tu produis un blueprint éditorial JSON strict.
Le blueprint doit contenir :
- title_target: proposition de title tag (50-60 chars)
- angle: angle différenciant
- target_words: nombre cible de mots
- sections: liste ordonnée d'objets {id, h2, bullets, element?}
  où element ∈ {table, faq, list, callout} si pertinent
- schema_recommendations: liste de types schema.org à implémenter
"""

USER_TEMPLATE = """Mot-clé: {keyword}
Intent: {intent}
Type de contenu: {content_type}

Rapport sémantique:
{report}

Produis le blueprint en JSON strict, sans markdown autour. Adapte la structure au type de contenu :
- blog: introduction, sections de fond, FAQ, conclusion
- category: introduction marketing, critères de choix, comparatif (table), FAQ
- product: bénéfices, caractéristiques, FAQ courte
- service_lp: promesse, bénéfices, preuves, FAQ, CTA implicite (sans bouton, juste structure)
"""


@dataclass
class Blueprint:
    title_target: str
    angle: str
    target_words: int
    sections: list[dict[str, Any]]
    schema_recommendations: list[str]
    llm_cost: float

    def to_dict(self) -> dict:
        return {
            "title_target": self.title_target,
            "angle": self.angle,
            "target_words": self.target_words,
            "sections": self.sections,
            "schema_recommendations": self.schema_recommendations,
        }


async def build_blueprint(
    *,
    keyword: str,
    intent: str,
    content_type: str,
    report: SemanticReport,
) -> Blueprint:
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
        ),
    )
    resp = await llm.complete(system=SYSTEM, user=user, max_tokens=2000)
    data = llm.extract_json(resp.text)
    return Blueprint(
        title_target=data.get("title_target", ""),
        angle=data.get("angle", ""),
        target_words=int(data.get("target_words", 1500)),
        sections=list(data.get("sections", [])),
        schema_recommendations=list(data.get("schema_recommendations", [])),
        llm_cost=resp.cost,
    )
