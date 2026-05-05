"""Build/regenerate the editorial Blueprint from the semantic report."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services import llm
from app.services.analysis import SemanticReport

SYSTEM = """Tu es un stratège SEO éditorial senior. Tu produis un blueprint éditorial \
au format JSON STRICT (pas de markdown autour, pas de prose).

Ce blueprint sera donné directement à un rédacteur Claude — il doit être assez précis \
pour produire un contenu top-niveau du premier coup, sans aller-retours.

Schéma attendu :
{
  "title_target": string,           // 50-60 chars, accroche, mot-clé en début
  "angle": string,                  // angle différenciant en 1-2 phrases concrètes
  "target_words": number,           // cible mots, calibrée selon avg_words concurrents
  "tone": string,                   // 1-2 mots : "pratique direct", "expertise sobre", etc.
  "sections": [
    {
      "id": string,                 // slug court ("intro", "comparatif", "faq")
      "h2": string,                 // intitulé H2 final (clair, sans clickbait)
      "purpose": string,            // 1 phrase : que doit absorber le lecteur ici
      "bullets": [string],          // 3-6 points concrets à couvrir (PAS des H3)
      "element": "table"|"faq"|"list"|"callout"|null,  // structure spécifique si pertinent
      "must_terms": [string]        // termes du required_terms à intégrer dans cette section
    }
  ],
  "schema_recommendations": [string]  // schemas.org : ["Article", "FAQPage", "Product"]
}

Règles structurelles strictes :
- Pas de section "Introduction" générique : la 1ère section doit avoir un nom utile.
- Pas de "Conclusion" creuse : finir par une section de synthèse pratique ("À retenir",
  "Comment choisir", FAQ, etc.).
- Adapte la structure au type de contenu :
    - blog : 5-8 sections, FAQ en avant-dernier, tableau si comparaison pertinente
    - category : intro courte, "critères de choix" structuré, comparatif tabulé, FAQ
    - product : bénéfices listés, caractéristiques tabulées, FAQ courte (3-4 questions)
    - service_lp : promesse, bénéfices structurés, processus/preuves, FAQ, pas de section "CTA"
- Chaque section doit avoir 3-6 bullets concrets, pas des sous-titres H3.
- must_terms : répartis intelligemment les required_terms pour qu'ils soient TOUS couverts
  au moins une fois entre les sections.
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
    resp = await llm.complete(system=SYSTEM, user=user, max_tokens=2500, temperature=0.4)
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
