"""Content generation: type-specific prompts producing title variants + HTML + schema.

This is the core of the product — content quality lives or dies here.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.services import llm

EDITORIAL_RULES = """Tu écris comme un rédacteur web FR senior, pas comme une IA. Tu as des
opinions, tu surprends, tu fais des choix.

INTERDITS (zéro tolérance, partout dans le texte) :
- Connecteurs robots : "en outre", "par ailleurs", "de plus", "en effet",
  "ainsi", "toutefois", "néanmoins", "certes", "par conséquent", "de surcroît",
  "qui plus est".
- Méta-emphases : "il convient/est important/essentiel/crucial de", "force est
  de constater", "n'oublions/n'hésitez pas", "veillez à".
- Intros vagues : "dans le monde de", "de nos jours", "à l'ère du", "lorsqu'il
  s'agit de", "dans cet article", "nous allons voir".
- Vocab IA : optimiser (>5x), essentiel/crucial/fondamental, robuste, "afin de"
  (dis "pour"), "permettre de", paysage/tapisserie figuré, intriqué, vibrant,
  niché, révolutionnaire, renommé, favoriser figuré, s'aligner/résonner avec,
  approfondir/enrichir figuré, "engagement envers", "découvrez" (en début).
- Emphase signification : "moment pivot", "tournant", "rôle clé/vital",
  "marque indélébile", "préparant le terrain", "pertinence durable".
- Queues participe présent (", soulignant/contribuant/reflétant/favorisant…") :
  coupe systématiquement.
- "Ce n'est pas X, c'est Y" : 1 fois max dans tout le texte.
- Triplets parallèles ("innovant, performant, durable") : interdits.
- Fausse plage "de X à Y" sans vrai spectre : interdite.
- Évitement de "être" via "sert de/constitue/incarne/offre/dispose de" : non,
  reviens à "est"/"a".
- Tirets longs (— ou –) : zéro. Utilise parenthèses, virgules, deux-points.

VARIATION ÉLÉGANTE : RÉPÈTE le nom propre (Semrush 4x) plutôt que des synonymes
(outil/solution/plateforme).

RYTHME (obligatoire) :
- ≥3 phrases ultra-courtes (1-5 mots, type "Pas ouf.", "Résultat : rien.").
- ≥2 phrases longues (30+ mots, subordonnées).
- Jamais 3 phrases consécutives de longueur similaire (±3 mots).

PARAGRAPHES (variation imposée) :
- Règle d'or : 1 paragraphe = 1 idée unique, pertinente, utile au lecteur.
  Pas de redite. Si l'info est déjà dite, ne la reformule pas, passe à la
  suite.
- Longueur VARIÉE : alterner entre paragraphes courts (1-2 phrases, parfois
  une seule phrase de 5-8 mots qui frappe), paragraphes moyens (3-4 phrases)
  et paragraphes longs (5-7 phrases pour développer un point complexe).
- INTERDIT : avoir 3 paragraphes consécutifs de longueur similaire. Un
  rédacteur humain respire en alternant. Un rédacteur IA aligne des blocs
  uniformes — c'est le marqueur le plus détectable.
- Si tu te retrouves à écrire 4 paragraphes "moyens" d'affilée, casse le
  rythme : insère un paragraphe d'une seule phrase qui pose une question,
  ou un constat sec.

CASSE DES TITRES (H1, H2, H3) — RÈGLE STRICTE :
- Capitalise UNIQUEMENT la 1ère lettre du titre, et après un deux-points ou
  un tiret cadratin/long.
- INTERDIT le title-case anglo-saxon "Les Erreurs Fatales Des Chatbots En
  Entreprise". Forme correcte : "Les erreurs fatales des chatbots en
  entreprise".
- Exception : noms propres et marques (Google, ChatGPT, Webflow…) gardent
  leurs majuscules d'origine.
- Exemples valides :
  ✓ "Comment choisir une cafetière en 2026"
  ✓ "Cafetière à grain : guide d'achat complet"
  ✓ "Pourquoi le SEO change — et comment s'adapter"
  ✗ "Comment Choisir Une Cafetière En 2026"  ← INTERDIT
  ✗ "Les Outils SEO Indispensables"           ← INTERDIT

OUVERTURES H2 : varie. Exemple concret / question / affirmation tranchée /
chiffre / anecdote / contradiction. Pas de phrase de contexte vague.

OBLIGATOIRE au moins 1 fois : parenthèse explicative ("(en gros, X)") ;
question rhétorique non creuse ; référence concrète (nom d'outil, marque) ;
chiffre précis non rond ("+23 %" pas "significatif").

CONCLUSION : pas de résumé. Termine par conseil actionnable, question ouverte,
ou prise de position. Jamais "En résumé/Pour conclure/Dans l'ensemble".

GRAS : dans CHAQUE paragraphe de prose, mets en <strong> 4-8 mots CONTIGUS
qui portent l'info clé (verdict / chiffre / mot-clé central). UN seul groupe
par paragraphe. Lus à la suite, les passages en gras doivent former phrase.

H3 (aération) : si une section H2 dépasse 4 paragraphes ou 350 mots, découpe
avec 1-3 <h3>.

HTML : tags AUTORISÉS uniquement h1, h2, h3, p, ul, ol, li, table, thead,
tbody, tr, th, td, strong, em, a. IDs slugifiés sur tous les <h2>. Pas de div,
classe, style. Listes 3-5 items, longueurs variées, pas de gras systématique
sur le 1er mot. Section H2 ≥ 200 mots avant la suivante.

Préfère "Et"/"Mais" en début de phrase à un connecteur formel.

DIVERSITÉ DES EXPRESSIONS (anti keyword stuffing) : les "cibles de fréquence
par terme" plus bas indiquent COMBIEN de fois il faut couvrir UN CONCEPT.
Ne répète JAMAIS l'expression exacte autant de fois — varie les surface forms.
Exemple : si "gouvernance conversationnelle" doit apparaître 5 fois, alterne
entre "gouvernance conversationnelle", "pilotage du chatbot", "cadre de
gouvernance", "garde-fous opérationnels", "supervision du dispositif". Le
fond doit être couvert, pas la formulation cocher des cases. Une expression
identique répétée plus de 2 fois = signal de bourrage côté Google.

INTRO + CONCLUSION (zéro pitch) : les 200 premiers mots et les 150 derniers
mots NE DOIVENT PAS contenir :
- le nom du domaine cible ni d'aucune marque rédactrice
- une formule promotionnelle ("nous accompagnons", "notre équipe", "faites
  appel à", "n'hésitez pas à nous contacter")
L'intro doit poser le problème ou un fait. La conclusion doit donner un
conseil actionnable ou une prise de position. Si une marque externe doit
être citée, mets-la dans le corps de l'article, pas aux bornes.
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


SYSTEM_TEMPLATE = """Tu es rédacteur SEO senior FR. Tu écris pour des humains qui doivent
apprendre, pas pour cocher des cases.

{type_brief}

{rules}

Réponds UNIQUEMENT en JSON strict (pas de markdown) :
{{
  "title_variants": [
    {{"title": "...", "meta": "..."}},
    {{"title": "...", "meta": "..."}},
    {{"title": "...", "meta": "..."}}
  ],
  "html": "<h1>...</h1>...",
  "schema_recommendations": {{"types": ["Article", "FAQPage"]}},
  "image_prompt": "..."
}}

title_variants : exactement 3, angles distincts.
- title 50-60 car., mot-clé en début si naturel, zéro clickbait.
- CASSE : capitale UNIQUEMENT en 1ère lettre + après ':' ou tiret long, JAMAIS
  une majuscule par mot. Marques/noms propres exceptés.
  ✓ "Webflow ou WordPress en 2026 ?"
  ✗ "Webflow Ou WordPress En 2026 ?"
- meta 140-160 car. MINI-RÉSUMÉ qui répond presque au title : verdict d'abord
  puis invite ("Voir le comparatif.", "Détails ici."). Pas de "Découvrez tout
  sur X". Ex : title "Webflow ou WordPress en 2026 ?" → meta "Webflow pour les
  designers, WordPress pour les agences. Voir le comparatif."

html :
- H1 = chosen_title (1ère variante).
- Respecte la blueprint : sections, h2, bullets.
- Intègre must_terms, entités et termes obligatoires fluides (zéro bourrage).
- Cible target_words ± 15 %.
- Exploite content_gaps (différenciation vs SERP).

image_prompt : 1-2 phrases (FR/EN). Visuel éditorial sobre (photo ou
illustration), pas couverture magazine. Pas de texte/mots dans l'image.
"""


USER_TEMPLATE = """Date du jour : {today} (utilise cette date comme référence si tu mentionnes une année — ne dis JAMAIS une année passée comme si c'était l'année courante).

Mot-clé cible : {keyword}
Intent : {intent}
Type de contenu : {content_type}
Domaine cible : {domain}
{listicle_block}
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
{silo_block}
Réponds en JSON strict.
"""


# ---------------------------------------------------------------------------
# Listicle detection
# ---------------------------------------------------------------------------

# Match a number written as digits OR as a French numeral word, when it sits
# in a title that looks like a list ("10 erreurs", "5 outils", "7 raisons").
_LISTICLE_RE = re.compile(
    r"(?:^|[^\w])(\d{1,3}|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt)\s+"
    r"(?:[\wéèêëàâîïôöûüç-]+)",
    re.IGNORECASE,
)
_NUMERAL_FR = {
    "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7,
    "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "quinze": 15,
    "vingt": 20,
}


def detect_listicle_count(text: str) -> int | None:
    """If `text` (keyword, blueprint title) implies a numbered list, return
    the count. Else None. Used to enforce a structured H2/H3 numbering in the
    generation prompt — otherwise Claude often delivers prose that doesn't
    match the title's promise."""
    if not text:
        return None
    m = _LISTICLE_RE.search(text)
    if not m:
        return None
    raw = m.group(1).lower()
    if raw.isdigit():
        n = int(raw)
        # Only treat as listicle for sensible list sizes.
        if 3 <= n <= 50:
            return n
        return None
    return _NUMERAL_FR.get(raw)


def _listicle_block(keyword: str, blueprint: dict) -> str:
    """Build the prompt fragment that forces a numbered structure when the
    user keyword (or blueprint title) asks for N items."""
    title = (blueprint or {}).get("title_target") or ""
    n = detect_listicle_count(title) or detect_listicle_count(keyword)
    if not n:
        return ""
    return (
        f"\nFORMAT LISTICLE OBLIGATOIRE — le titre annonce {n} items.\n"
        f"- Tu dois livrer EXACTEMENT {n} items numérotés explicitement (1., 2., …, {n}.).\n"
        f"- Chaque item est un H2 ou un H3 dont le texte commence par son numéro :\n"
        f"  ex. \"1. Premier item\", \"2. Deuxième item\".\n"
        f"- Pas de regroupement (\"Items 1-3\", \"4-6\") : un H2/H3 par item, sans exception.\n"
        f"- Si le sujet ne supporte pas {n} items distincts, dis-le DANS l'introduction\n"
        f"  ET trouve {n} angles complémentaires plutôt que de fusionner — la promesse\n"
        f"  du titre prime sur tout.\n"
    )


# ---------------------------------------------------------------------------
# Silo prompt injection
# ---------------------------------------------------------------------------

SILO_RULES_COMMON = """
MAILLAGE INTERNE (zéro tolérance) :
- Liens CONTEXTUELS, intégrés au fil de la phrase, ancre = pivot sémantique.
- ANCRES BANNIES : "consultez notre article", "découvrez notre guide", "voir
  aussi", "à lire également", "lire la suite", "plus d'infos ici", "cliquez
  ici", "en savoir plus", "notre/cet autre article sur".
- Ancres VARIÉES : jamais 2 ancres identiques. Varie verbe, nom, expression.
- Format : <a href="URL_EXACTE_FOURNIE">ancre courte</a>. Pas de target/rel/class.
- 1 LIEN MAX par couple (source → cible). Jamais 2 liens vers la même URL.
- Pour les liens VOISINS uniquement : si l'URL ne s'intègre pas naturellement,
  ne pas la forcer (zéro lien plutôt qu'un lien forcé). Le lien PILIER, lui,
  reste OBLIGATOIRE dans TOUS les cas (voir RÔLE ci-dessous).
"""

SILO_RULES_SATELLITE = """
RÔLE : article satellite d'un silo.

PILIER (URL exacte) : {pillar_url}
→ 1 lien OBLIGATOIRE vers cette URL, posé dans l'introduction OU les 3
  premiers <p> du texte. Ancre contextuelle, intégrée au fil de la phrase.
→ Cette obligation est NON-NÉGOCIABLE. Elle prime sur la règle "ne pas
  forcer un lien" : le lien pilier DOIT être présent, même si tu dois
  reformuler la phrase d'introduction pour qu'il s'y intègre naturellement.
→ La présence du lien pilier est VÉRIFIÉE automatiquement après génération.
  Un article sans lien pilier sera signalé comme défaillant.

VOISINS du silo (similarité décroissante) :
{peer_block}
→ 0 ou 1 lien max par voisin. Pose le lien quand le sujet voisin est
  mentionné naturellement (terme/notion lié). Vise le PLUS de liens voisins
  possibles TANT QUE c'est naturel ; jamais forcé. Priorise les voisins en
  haut de liste. Pour les voisins UNIQUEMENT, ne pas forcer un lien qui
  ne s'intègre pas.
"""

SILO_RULES_PILLAR = """
RÔLE : page pilier d'un silo. Vue d'ensemble + introduit CHAQUE sous-thème +
pousse vers son satellite dédié.

SATELLITES :
{satellite_block}

IMPÉRATIF :
- Pour CHAQUE satellite ci-dessus : section ou paragraphe (2-4 phrases) qui
  présente le sous-thème ET contient EXACTEMENT 1 lien
  <a href="URL_SATELLITE">ancre contextuelle</a> au fil du texte.
- Ancre = mot/expression qui désigne le concept, jamais "voir l'article".
- Aucun satellite sans son lien.
- Ne mentionne pas l'existence d'un "article dédié" : le lien parle seul.
"""


def _format_satellite_block(peers: list[dict]) -> str:
    if not peers:
        return "(aucun voisin)"
    lines = []
    for p in peers:
        topic = (p.get("topic") or p.get("keyword") or "").strip() or "(sans topic)"
        lines.append(f'- {p["url"]}  — sujet : {topic}')
    return "\n".join(lines)


def _silo_block(link_manifest: dict | None) -> str:
    if not link_manifest:
        return ""
    role = link_manifest.get("role")
    if role == "satellite":
        peer_block = _format_satellite_block(link_manifest.get("peer_links") or [])
        return (
            "\n\n=== CONTEXTE SILO ===\n"
            + SILO_RULES_COMMON
            + SILO_RULES_SATELLITE.format(
                pillar_url=link_manifest.get("pillar_url", ""),
                peer_block=peer_block,
            )
        )
    if role == "pillar":
        sat_block = _format_satellite_block(link_manifest.get("satellite_links") or [])
        return (
            "\n\n=== CONTEXTE SILO ===\n"
            + SILO_RULES_COMMON
            + SILO_RULES_PILLAR.format(satellite_block=sat_block)
        )
    return ""


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
    use_haiku: bool = False,
    link_manifest: dict | None = None,
    capture: dict | None = None,
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
        today=datetime.utcnow().strftime("%d %B %Y"),
        keyword=keyword,
        intent=intent,
        content_type=content_type,
        domain=domain or "(aucun)",
        listicle_block=_listicle_block(keyword, blueprint),
        blueprint=json.dumps(blueprint, ensure_ascii=False, indent=2),
        required_terms=", ".join(required_terms[:30]) or "(aucun)",
        entities=", ".join(entities[:20]) or "(aucune)",
        term_targets=targets_text,
        content_gaps="; ".join(content_gaps[:10]) or "(aucun)",
        target_words=blueprint.get("target_words", 1500),
        silo_block=_silo_block(link_manifest),
    )
    model = llm.HAIKU if use_haiku else llm.SONNET
    resp = await llm.complete(
        system=system,
        user=user,
        max_tokens=12000,  # bumped from 8000: long FR articles + silo block could hit the cap
        temperature=0.6,
        model=model,
    )
    if capture is not None:
        capture.update(system=system, user=user, model=model, cost=resp.cost)
    data = llm.extract_json(resp.text)
    html = str(data.get("html", "")).strip()
    title_variants = list(data.get("title_variants", []))[:3]
    # Sanity check: if the response was truncated (max_tokens hit) the repair
    # in extract_json may return a JSON with an empty/very short html field.
    # Reject loud here so the pipeline marks the job 'failed' instead of saving
    # an empty page as 'generated'. The user can then click "Régénérer" to retry.
    if len(html) < 400 or "<h" not in html.lower():
        raise RuntimeError(
            f"generator returned an unusable html (len={len(html)}, "
            f"variants={len(title_variants)}). Likely max_tokens hit during "
            f"generation. Click 'Régénérer' on this article to retry."
        )
    return Generated(
        title_variants=title_variants,
        html=html,
        schema_recommendations=dict(data.get("schema_recommendations", {})),
        image_prompt=str(data.get("image_prompt", "")),
        llm_cost=resp.cost,
    )
