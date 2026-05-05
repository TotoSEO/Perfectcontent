"""Content generation: type-specific prompts producing title variants + HTML + schema.

This is the core of the product — content quality lives or dies here.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services import llm

EDITORIAL_RULES = """RÈGLES ÉDITORIALES STRICTES — non négociables :

Anti-tells IA (interdits absolus) :
- Pas de "il est important de noter", "n'oublions pas", "force est de constater",
  "à l'heure où", "dans un monde où", "à l'ère du", "ne sous-estimez pas".
- Pas de connecteurs robotiques en cascade : "en effet", "par ailleurs", "de surcroît",
  "qui plus est", "toutefois" ne doivent JAMAIS s'enchaîner sur 2 paragraphes consécutifs.
- Pas de structure ternaire systématique ("rapide, efficace, pratique" / "X, Y et Z").
- Pas de superlatifs vides ("incroyable", "extraordinaire", "révolutionnaire").
- Pas de méta-phrases ("dans cet article", "nous allons voir", "comme nous l'avons vu").
- Pas de questions rhétoriques creuses ("Vous vous demandez peut-être ?").
- Pas de "il existe plusieurs", "il y a différents", remplace par les éléments concrets.

Rythme & syntaxe :
- Alterne phrases courtes (8-15 mots) et moyennes (20-30 mots). Évite les pavés.
- Une idée par paragraphe, jamais plus. Maximum 4-5 phrases par paragraphe.
- Pas de redondance entre sections : si tu as dit X dans la section 2, ne le répète pas
  en section 5 (référence-le brièvement si nécessaire).
- Évite les anglicismes inutiles ("game-changer", "challenge", "best practices").
- Mets les chiffres concrets quand tu en as ("entre 80 et 120 €", pas "raisonnable").

Vocabulaire :
- Concret > abstrait. "Une cafetière à grain pèse 3-5 kg" > "elle a un poids notable".
- Précis > vague. "réduit de 30 %" > "réduit significativement".
- Si tu cites une norme/marque/donnée, sois exact ou ne cite pas.

Structure HTML :
- Tags autorisés : h1, h2, h3, p, ul, ol, li, table, thead, tbody, tr, th, td, strong, em.
- IDs slugifiés sur tous les <h2> (pour ancrage et maillage interne).
- Pas de classes CSS, pas d'inline style, pas de divs.
- Tableaux propres avec <thead> et <tbody>.
- FAQ : un H3 par question, un <p> par réponse. Pas de <details>.
"""


PROMPTS = {
    "blog": (
        "Tu rédiges un article de blog SEO de qualité éditoriale. Le lecteur doit "
        "apprendre quelque chose d'utile et concret. Ouvre par une accroche qui établit "
        "le sujet sans cliché ni intro générique — vise une phrase d'ouverture qui "
        "annonce un fait précis ou pose une question utile. Déroule des sections "
        "autonomes (chacune se lit isolément). Termine par une synthèse pratique, "
        "pas une conclusion creuse."
    ),
    "category": (
        "Tu rédiges une page de catégorie e-commerce. Texte d'introduction marketing "
        "dense et utile (pas du remplissage), critères de choix structurés, comparatif "
        "tabulé si la blueprint le demande, FAQ. Ton commercial mais informatif, sans "
        "hyperbole ni langage de pub. Le lecteur doit pouvoir prendre une décision "
        "d'achat éclairée à partir du seul texte."
    ),
    "product": (
        "Tu rédiges une fiche produit. Bénéfices concrets en haut (3-5 puces avec un "
        "chiffre ou une caractéristique tangible chacune), caractéristiques techniques "
        "structurées, courte FAQ (3-4 questions). Ton précis et factuel, orienté "
        "décision d'achat. Pas de superlatifs, pas de promesses vagues."
    ),
    "service_lp": (
        "Tu rédiges une landing page de service. Promesse claire dans la 1ère section "
        "(en quoi consiste le service + à qui ça s'adresse + quel résultat). Bénéfices "
        "structurés avec preuves (chiffres, processus, garanties). Section FAQ. "
        "Aucun bouton, aucun CTA explicite : c'est une page texte, le bouton sera ajouté "
        "côté CMS."
    ),
}


SYSTEM_TEMPLATE = """Tu es rédacteur SEO senior francophone. Tu écris pour des humains \
qui doivent apprendre quelque chose, pas pour cocher des cases.

{type_brief}

{rules}

Réponds UNIQUEMENT en JSON strict (pas de markdown autour) avec ce schéma :
{{
  "title_variants": [
    {{"title": "...", "meta": "..."}},
    {{"title": "...", "meta": "..."}},
    {{"title": "...", "meta": "..."}}
  ],
  "html": "<h1>...</h1>...",
  "schema_recommendations": {{"types": ["Article", "FAQPage"]}},
  "image_prompt": "description précise et exploitable pour générer une image éditoriale"
}}

Contraintes sur title_variants :
- Exactement 3 variantes, distinctes (angle / formulation différente).
- title : 50-60 caractères, mot-clé en début si naturel, pas de clickbait.
- meta : 140-160 caractères, claire, contient le mot-clé une fois, finit sur un "pourquoi".

Contraintes sur html :
- Inclure le H1 (= chosen_title de la 1ère variante par défaut).
- Respecter rigoureusement la blueprint validée : ses sections, leurs h2, leurs bullets.
- Intégrer NATURELLEMENT les "must_terms" de chaque section (sans bourrage).
- Atteindre la cible "target_words" ± 15 %.
- Utiliser les "entités" et "termes obligatoires" du rapport sémantique de manière fluide.
- Exploiter les "content_gaps" : ce que personne ne couvre, c'est ta différenciation.

Contraintes sur image_prompt :
- 1-2 phrases, anglais ou français selon ce qui rend mieux.
- Décris un visuel ÉDITORIAL (photographie ou illustration sobre), pas une couverture
  de magazine.
- Pas de texte dans l'image, pas de mots-clés gravés.
"""


USER_TEMPLATE = """Mot-clé cible : {keyword}
Intent : {intent}
Type de contenu : {content_type}
Domaine cible : {domain}

Blueprint VALIDÉE (à respecter strictement) :
{blueprint}

Termes obligatoires à intégrer (vient du rapport sémantique) :
{required_terms}

Entités à mentionner (≥ 1 fois si pertinent) :
{entities}

Cibles de fréquence par terme (top concurrents — vise ces nombres ± 30 %) :
{term_targets}

Content gaps à exploiter (différenciation vs SERP) :
{content_gaps}

Cible totale : {target_words} mots.

Réponds en JSON strict.
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
    term_targets: list[dict] | None = None,
) -> Generated:
    system = SYSTEM_TEMPLATE.format(
        type_brief=PROMPTS.get(content_type, PROMPTS["blog"]),
        rules=EDITORIAL_RULES,
    )
    targets_text = (
        "\n".join(
            f"- {t.get('term')} : ~{t.get('target')} occurrences (entre {t.get('min')} et {t.get('max')})"
            for t in (term_targets or [])[:25]
        )
        if term_targets
        else "(non calculé)"
    )

    user = USER_TEMPLATE.format(
        keyword=keyword,
        intent=intent,
        content_type=content_type,
        domain=domain or "(aucun)",
        blueprint=json.dumps(blueprint, ensure_ascii=False, indent=2),
        required_terms=", ".join(required_terms[:30]) or "(aucun)",
        entities=", ".join(entities[:20]) or "(aucune)",
        term_targets=targets_text,
        content_gaps="; ".join(content_gaps[:10]) or "(aucun)",
        target_words=blueprint.get("target_words", 1500),
    )
    resp = await llm.complete(
        system=system,
        user=user,
        max_tokens=8000,
        temperature=0.6,
    )
    data = llm.extract_json(resp.text)
    return Generated(
        title_variants=list(data.get("title_variants", []))[:3],
        html=str(data.get("html", "")),
        schema_recommendations=dict(data.get("schema_recommendations", {})),
        image_prompt=str(data.get("image_prompt", "")),
        llm_cost=resp.cost,
    )
