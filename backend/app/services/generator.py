"""Content generation: type-specific prompts producing title variants + HTML + schema."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services import llm

EDITORIAL_RULES = """Règles éditoriales strictes :
- Pas de structures en triplets répétitifs ("rapide, efficace, pratique")
- Pas de connecteurs robotiques ("en effet", "par ailleurs", "de surcroît") en cascade
- Une idée par paragraphe, jamais de redondance entre sections
- Phrases courtes alternées avec phrases moyennes, jamais de paragraphe-pavé
- Vocabulaire concret et précis, éviter les superlatifs vides
- Pas de "il est important de noter que" ni "n'oublions pas"
- HTML propre : <h2>, <h3>, <p>, <ul>, <ol>, <table>, <strong>, <em> uniquement
- IDs sur les <h2> au format slugifié pour ancrage
"""

PROMPTS = {
    "blog": (
        "Tu rédiges un article de blog SEO de qualité éditoriale, utile au lecteur et "
        "informatif. L'article doit ouvrir avec une accroche concrète sans cliché, dérouler "
        "des sections autonomes, et fermer sur une synthèse utile (pas une conclusion creuse)."
    ),
    "category": (
        "Tu rédiges une page de catégorie e-commerce. Texte d'introduction marketing concis, "
        "critères de choix structurés, comparatif tabulé si pertinent, FAQ. Ton commercial mais "
        "informatif, sans hyperbole."
    ),
    "product": (
        "Tu rédiges une fiche produit. Bénéfices concrets, caractéristiques structurées en "
        "liste, courte FAQ. Ton précis et factuel, orienté décision d'achat."
    ),
    "service_lp": (
        "Tu rédiges une landing page de service. Promesse claire en intro, bénéfices "
        "structurés, preuves implicites (indicateurs, processus), FAQ, structure orientée "
        "conversion sans CTA explicite (pas de bouton)."
    ),
}

SYSTEM_TEMPLATE = """Tu es un rédacteur SEO senior francophone.

{type_brief}

{rules}

Tu réponds UNIQUEMENT en JSON strict avec ce schéma :
{{
  "title_variants": [{{"title": "...", "meta": "..."}}, ... 3 entrées],
  "html": "<h1>...</h1>...",
  "schema_recommendations": {{"types": ["Article", "FAQPage"]}},
  "image_prompt": "description courte pour génération d'image éditoriale"
}}

Pas de markdown autour du JSON. Les titles font 50-60 chars, les méta-descriptions 140-160 chars."""

USER_TEMPLATE = """Mot-clé: {keyword}
Intent: {intent}
Domaine cible: {domain}

Blueprint validé:
{blueprint}

Termes obligatoires à intégrer naturellement: {required_terms}
Entités à mentionner: {entities}
Content gaps à exploiter: {content_gaps}

Cible: {target_words} mots. Réponds en JSON strict.
"""


@dataclass
class Generated:
    title_variants: list[dict[str, str]]
    html: str
    schema_recommendations: dict[str, Any]
    image_prompt: str
    llm_cost: float


async def generate_content(
    *,
    keyword: str,
    intent: str,
    content_type: str,
    domain: str | None,
    blueprint: dict,
    required_terms: list[str],
    entities: list[str],
    content_gaps: list[str],
) -> Generated:
    system = SYSTEM_TEMPLATE.format(
        type_brief=PROMPTS.get(content_type, PROMPTS["blog"]),
        rules=EDITORIAL_RULES,
    )
    user = USER_TEMPLATE.format(
        keyword=keyword,
        intent=intent,
        domain=domain or "(aucun)",
        blueprint=json.dumps(blueprint, ensure_ascii=False),
        required_terms=", ".join(required_terms[:30]),
        entities=", ".join(entities[:20]),
        content_gaps="; ".join(content_gaps[:10]),
        target_words=blueprint.get("target_words", 1500),
    )
    resp = await llm.complete(system=system, user=user, max_tokens=6000, temperature=0.7)
    data = llm.extract_json(resp.text)
    return Generated(
        title_variants=list(data.get("title_variants", []))[:3],
        html=str(data.get("html", "")),
        schema_recommendations=dict(data.get("schema_recommendations", {})),
        image_prompt=str(data.get("image_prompt", "")),
        llm_cost=resp.cost,
    )
