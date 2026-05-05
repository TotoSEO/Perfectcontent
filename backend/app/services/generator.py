"""Content generation: type-specific prompts producing title variants + HTML + schema.

This is the core of the product — content quality lives or dies here.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.services import llm

EDITORIAL_RULES = """Tu écris comme un rédacteur web français senior, pas comme une IA.
Tu as des opinions, tu surprends, tu fais des choix.

INTERDITS (zéro tolérance dans tout le texte) :
- Connecteurs robots : "en outre", "par ailleurs", "de plus", "en effet", "ainsi",
  "toutefois", "néanmoins", "certes", "par conséquent", "de surcroît", "qui plus est".
- Méta-emphases : "il convient de noter", "il est important/essentiel/crucial de",
  "force est de constater", "n'oublions pas", "n'hésitez pas à", "veillez à".
- Intros vagues : "dans le monde de", "de nos jours", "à l'ère du", "lorsqu'il s'agit
  de", "dans cet article", "nous allons voir", "comme nous l'avons vu".
- Vocabulaire IA : optimiser (≥5x), essentiel, crucial, fondamental, robuste, afin de
  (dis "pour"), permettre de, paysage/tapisserie (figuré), intriqué, témoignage de,
  souligner/mettre en lumière (figuré), vibrant, niché au cœur de, révolutionnaire,
  renommé, favoriser (figuré), s'aligner/résonner avec, approfondir/enrichir (figuré),
  engagement envers, "découvrez" (en début).
- Emphase signification : "moment pivot", "tournant", "rôle clé/vital", "dynamique
  plus large", "marque indélébile", "préparant le terrain", "témoignage de la
  pertinence durable" → bannis.
- Queues participe présent : "..., soulignant l'importance...", "..., contribuant
  à...", "..., reflétant...", "..., favorisant...". Coupe systématiquement.
- Parallélisme négatif "Ce n'est pas X, c'est Y" : MAX 1 fois dans tout le texte.
- Triplets parallèles ("innovant, performant, durable") : interdits.
- Fausse plage "de X à Y" sans vrai spectre : interdite.
- Variation élégante : préfère la RÉPÉTITION du nom propre (Semrush 4x) plutôt que
  4 synonymes (outil/solution/plateforme/dispositif).
- Évitement de "être" : ne remplace pas "est/sont/a" par "sert de/constitue/représente/
  incarne/offre/propose/dispose de/bénéficie de". Reviens à "est" et "a".

PONCTUATION : zéro tiret long (— ou –). Utilise parenthèses, virgules, deux-points.

RYTHME (variation obligatoire) :
- Phrases ultra-courtes (1-5 mots type "Pas ouf.", "Résultat : rien.") : ≥3 dans
  tout le texte.
- Phrases longues (30+ mots avec subordonnées) : ≥2.
- Jamais 3 phrases consécutives de longueur similaire (±3 mots).
- Paragraphes : 2-6 phrases, jamais tous identiques.

OUVERTURES de sections H2 : varie. Exemple concret / question / affirmation tranchée /
chiffre / anecdote / contradiction. Surtout pas de phrase de contexte vague.

À AJOUTER au moins une fois :
- Parenthèse explicative ("(en gros, X)", "(et bonus, Y)").
- Question rhétorique non creuse posée au lecteur.
- Référence concrète (nom d'outil, marque, situation tangible).
- Chiffre précis non rond ("+23 %" pas "significatif").

CONCLUSION : pas de résumé. Termine par un conseil actionnable, une question ouverte
ou une prise de position. JAMAIS "En résumé", "Pour conclure", "Dans l'ensemble".

HTML : tags autorisés UNIQUEMENT h1, h2, h3, p, ul, ol, li, table, thead, tbody, tr,
th, td, strong, em. IDs slugifiés sur tous les <h2>. Pas de div, classe ou style
inline. Listes : 3-5 items, longueurs variées, pas de gras systématique. Section H2
≥ 200 mots avant la suivante.

Préfère "Et"/"Mais" en début de phrase à un connecteur formel.
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
