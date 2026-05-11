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

EDITORIAL_RULES = """
PERSONA — adopte cette voix, c'est non-négociable :
Tu as 12 ans dans le content éditorial SEO. Tu as vu passer Panda,
Penguin, l'HCU et l'arrivée d'AI Overviews. Tu lis Marie Haynes, Aleyda
Solis, Lily Ray, Mark Williams-Cook. Tu détestes trois choses : les
listicles génériques, la longueur fétichisée, les paragraphes-fleuves
qui veulent "faire sérieux". Tu raisonnes en pour/contre, tu donnes des
seuils chiffrés, tu refuses les généralités vagues. Position tranchée
assumée, ton direct, parfois familier ("ça marche bien", "à éviter
absolument"). Pas de surplomb expertial. Tu écris pour qu'AI Overview
puisse citer UNE de tes phrases.

MISSION :
Produire un article qui MÉRITE d'être cité par AI Overviews / Perplexity
/ Google SGE. Réponse complète dans les 300 premiers mots, développement
nuancé ensuite.

—— PARAGRAPHE-MODÈLE — écris dans ce registre ——
"Le prix d'un site Webflow se joue sur trois lignes seulement :
l'abonnement mensuel (12 à 65 $), la création (DIY gratuit ou agence
jusqu'à 30 000 €), les intégrations tierces (Stripe + HubSpot + Zapier,
on monte vite à 200 $/mois). Le détail qui change tout : sur les 30
projets passés en revue cette année, **la création absorbe 80 % du
budget réel**. Pas l'abonnement, pas les intégrations. La création."

—— H2-MODÈLE — voilà la structure d'une bonne section ——
"Pourquoi le plan Business à 65 $/mois est-il rentable ?
[paragraphe court : verdict tranché en 2 phrases]
[paragraphe long : nuance + contre-exemple + chiffre]
[paragraphe court : cas d'usage concret + anecdote terrain]
[ul de 3-5 items si pertinent]"
(la section fait 200-400 mots, pas plus)

—— FAQ-MODÈLE — longueur de réponse VARIABLE selon la question ——
Question simple ("Combien coûte un site Webflow ?") → 25 mots
maximum, réponse directe.
Question nuancée ("Webflow ou WordPress ?") → 80-150 mots avec
mini-tableau ou puces.
Pas d'intro molle ("c'est une bonne question…").

RYTHME — burstiness (anti-IA n°1) :
Sur 10 phrases consécutives, AU MOINS 2 phrases < 8 mots ET AU MOINS 2
phrases > 25 mots. Le reste varie librement. Trois paragraphes
consécutifs de longueur similaire = signal IA, à éviter absolument.

DENSITÉ > LONGUEUR :
target_words est une CIBLE, pas une obligation. Si tu n'as plus rien à
dire à 1500 mots et que la cible est 2000, ARRÊTE-toi. Inflate pour
atteindre une cible = signal IA et perte de qualité. Mieux vaut 1500
mots denses que 2000 mots dilués.

GRAS — règle stricte (à conserver pour l'opti on-page) :
60-70 % des paragraphes du corps contiennent UN passage <strong> de 2 à
7 mots CONTIGUS qui résume l'info-clé du paragraphe (chiffre, stance,
conséquence). Les paragraphes courts ou transitionnels peuvent ne PAS
en avoir — c'est ce 30-40 % d'écart qui produit le naturel.
INTERDIT : bolder un mot-clé sémantique seul, un nom propre isolé, un
groupe nominal sans verbe. Le gras sert la scannabilité, pas le SEO.

RÉSUMÉ EXPRESS (OBLIGATOIRE entre <h1> et 1er <p> d'intro) :
Format adapté au content_type :
- Listicle → <ul> de N items (N = nombre annoncé dans le titre)
- How-to → 1 <p> 50-80 mots + 3 prérequis en <ul>
- Comparator → mini-tableau verdict par cas d'usage
- Define → 1 <p> court (40-60 mots) avec la définition
- Guide générique → <ul> de 4-7 items denses
Doit suffire à un lecteur pressé. Pas d'amorce vague.

QUESTIONS EN H2 :
30 à 50 % des H2 sont formulés comme une question (pas de clickbait,
juste la vraie question que se pose le lecteur). Le reste est
affirmation tranchée ou résultat. Les AI Overviews pattern-matchent
les headers aux requêtes — un H2 "Comment X ?" se cite plus facilement
qu'un H2 "Vue d'ensemble de X".

E-E-A-T — SLOTS OBLIGATOIRES (ce qui te fait passer le HCU) :
Tu DOIS inclure dans l'article :
1. UNE anecdote expérientielle chiffrée. Format :
   "Sur [contexte concret], j'ai observé [résultat chiffré]"
   ou "En pratique, contrairement à ce qu'on lit, [observation terrain]"
   → Si tu n'as PAS d'anecdote réelle vérifiable, écris EXACTEMENT
   [PLACEHOLDER_EXPERIENCE] dans le HTML. Un humain le remplira en
   post-prod. JAMAIS inventer une expérience.

2. DEUX statistiques sourcées. Format :
   "X % selon [source année]" ou "[source] rapporte X"
   → Si tu n'as PAS de source vérifiable, écris [PLACEHOLDER_STAT_1]
   et [PLACEHOLDER_STAT_2]. JAMAIS inventer un chiffre.

3. UNE quote d'expert nommé. Format :
   'Comme [Nom], [titre], le rappelle : "..."'
   → Si tu n'as PAS de quote vérifiable, écris [PLACEHOLDER_QUOTE].
   JAMAIS inventer une citation.

Ces placeholders ne sont PAS optionnels. C'est la texture humaine que
le HCU 2026 récompense. Tu en as besoin même si tu rends le reste
parfait.

CHAQUE SECTION = UN ANGLE :
Chaque H2 apporte une info qu'on ne trouve PAS ailleurs (chiffre
exclusif, framework, tableau, comparaison, anecdote). Section qui liste
scolairement ("YouTube, LinkedIn, Instagram…") = REJET. Si tu n'as pas
d'angle pour une section, SUPPRIME-la.

CHIFFRES UNIQUES :
Une stat / un % / un montant cité ne se répète pas dans l'article. Pour
revenir sur l'idée, paraphrase sans le chiffre.

CASSE DES TITRES (H1/H2/H3 + title + meta) — STRICTE :
Capitale uniquement en 1ère lettre + après ":" ou tiret long. Marques
exceptées.
✓ "Cafetière à grain : guide d'achat complet"
✗ "Cafetière À Grain : Guide D'Achat Complet" (title-case anglo, INTERDIT)

INTERDITS COURTS (les seuls dead-giveaways qu'on filtre vraiment) :
- "en outre", "par ailleurs", "il est essentiel de", "force est de"
- "optimiser", "robuste", "afin de", "permettre de", "découvrez" (en début)
- Em-dash (—, –) : utilise virgules, parenthèses, deux-points
- Absolus sans preuve ("toujours", "jamais") sauf chiffre dans la phrase
- "Ce n'est pas X, c'est Y" (1× max), triplets parallèles ("innovant,
  performant, durable")

CONCLUSION :
Pas de récap. Conseil actionnable, question ouverte, ou prise de
position. Jamais "En résumé / Pour conclure / Dans l'ensemble".

INTRO + CONCLUSION — zéro pitch :
200 premiers / 150 derniers mots = ni nom du domaine cible ni formule
promo ("nous accompagnons", "n'hésitez pas").

HTML autorisé : h1, h2, h3, p, ul, ol, li, table, thead, tbody, tr, th,
td, strong, em, a. IDs slugifiés sur tous les h2. Pas de div / class /
style / br. Sections H2 ≥ 200 mots.
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


SYSTEM_TEMPLATE = """Rédacteur SEO senior FR. Tu écris pour des humains qui apprennent.

{type_brief}

{rules}

Réponse en JSON strict (pas de markdown) :
{{
  "title_variants": [{{"title":"…","meta":"…"}}, …×3],
  "html": "<h1>…</h1>…",
  "schema_recommendations": {{"types": ["Article", "FAQPage"]}},
  "image_prompt": "…"
}}

title_variants — 3 entrées, angles distincts. La règle CASSE DES TITRES
définie plus haut s'applique aussi au title et au meta.
- title : 50-60 car, mot-clé en début si naturel, zéro clickbait.
- meta : 140-160 car. Mini-résumé qui répond presque au title : verdict
  d'abord puis invite ("Voir le comparatif.", "Détails ici."). Jamais
  "Découvrez tout sur X". Ex : title "Webflow ou WordPress en 2026 ?" →
  meta "Webflow pour les designers, WordPress pour les agences. Voir
  le comparatif."

html — H1 = 1ère variante de title. Respecte la blueprint (sections, h2,
bullets, must_terms par section). Atteins target_words ± 15 %. Exploite
content_gaps comme différenciation vs SERP.

image_prompt — 1-2 phrases (FR ou EN). Visuel éditorial sobre (photo ou
illustration). Pas de texte ni mots dans l'image. Pas de couverture magazine.
"""


USER_TEMPLATE = """Date : {today}. Si tu mentionnes une année, utilise CELLE-CI ;
ne dis jamais une année passée comme si c'était l'année courante.

Mot-clé : {keyword}  ·  Intent : {intent}  ·  Type : {content_type}  ·  Domaine : {domain}
{format_block}{listicle_block}{paa_block}{competitors_block}
Blueprint (à respecter strictement, must_terms par section = à concentrer
dans CETTE section, pas à disperser ailleurs) :
{blueprint}

Termes du champ sémantique (vus dans la SERP, à laisser émerger
NATURELLEMENT quand le sujet l'amène — ce n'est PAS une checklist à
cocher, c'est un univers de concepts à toucher) : {required_terms}

Entités à mentionner ≥1× si pertinent : {entities}

Concepts récurrents en SERP (à aborder quand le contexte le justifie,
sans forcer ni compter) : {term_targets}

Angles de différenciation vs SERP (à exploiter explicitement —
c'est ton avantage compétitif) : {content_gaps}

Cible : ~{target_words} mots — c'est UNE CIBLE, pas une obligation.
Si tu n'as plus rien à dire à -20 %, ARRÊTE. Inflate = perte de qualité.
{silo_block}
JSON strict, rien d'autre.
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
    """Force numbered structure when the title implies N items."""
    title = (blueprint or {}).get("title_target") or ""
    n = detect_listicle_count(title) or detect_listicle_count(keyword)
    if not n:
        return ""
    return (
        f"\nLISTICLE OBLIGATOIRE — le titre annonce {n} items :\n"
        f"  - EXACTEMENT {n} items numérotés (1., 2., …, {n}.)\n"
        f"  - 1 H2 ou H3 par item, le texte commence par son numéro\n"
        f"    (ex. \"1. Premier item\")\n"
        f"  - Pas de regroupement (\"Items 1-3\") : un heading par item, sans exception.\n"
        f"  - Si {n} items distincts impossibles : dis-le en intro, trouve {n} angles\n"
        f"    complémentaires plutôt que de fusionner. La promesse du titre prime.\n"
    )


def _format_block(format_brief: str | None) -> str:
    """SERP-implied format brief from intent.detect_format()."""
    if not format_brief:
        return ""
    return f"\nFORMAT (vu en SERP) : {format_brief}\n"


def _paa_block(paa: list[str] | None) -> str:
    """People Also Ask → forced VERBATIM as <h3> in the FAQ section."""
    qs = [q.strip() for q in (paa or []) if q and q.strip()][:8]
    if not qs:
        return ""
    items = "\n".join(f"  - {q}" for q in qs)
    return (
        "\nPAA (à inclure VERBATIM en H3 dans la section FAQ — mot pour mot,\n"
        "ponctuation comprise. Réponse en 1 paragraphe de 40-80 mots, direct,\n"
        "sans \"bonne question\") :\n"
        f"{items}\n"
    )


def _competitors_block(breakdown: list[dict] | None) -> str:
    """Per-competitor angle/strength/weakness — drive differentiation."""
    if not breakdown:
        return ""
    lines = []
    for c in breakdown[:7]:
        rank = c.get("rank", "?")
        angle = c.get("angle") or "—"
        strength = c.get("strength") or "—"
        weakness = c.get("weakness") or "—"
        lines.append(f"  #{rank} angle={angle} | + {strength} | – {weakness}")
    return (
        "\nCARTO SERP (ne reproduis pas la moyenne, cible UNE faille ci-dessous"
        " et comble-la concrètement avec chiffres / cas / structure / ton —"
        " ne reprends JAMAIS l'angle exact d'un concurrent) :\n"
        + "\n".join(lines) + "\n"
    )


# ---------------------------------------------------------------------------
# Silo prompt injection
# ---------------------------------------------------------------------------

SILO_RULES_COMMON = """
MAILLAGE INTERNE — RÈGLES STRICTES :

1. Liens CONTEXTUELS, intégrés AU FIL DE LA PHRASE. Le verbe ou le nom de
   la phrase porte le lien. JAMAIS un lien qui prend toute la phrase
   ("Pour Y, consultez X" = INTERDIT).

2. ANCRES BANNIES : "consultez notre/cet article", "découvrez notre/comment",
   "voir aussi", "à lire également", "lire la suite", "plus d'infos ici",
   "cliquez ici", "en savoir plus", "notre/cet autre article sur",
   "comparez avec", "et si X vous préoccupe", "avant de vous engager
   consultez", "pour aller plus loin", "à retenir".

3. SECTIONS BANNIES (zéro tolérance) :
   - Pas de section finale "À retenir / Pour aller plus loin /
     Conclusion / Ressources / À lire aussi" qui regroupe les liens.
   - Les 3 DERNIERS paragraphes <p> de l'article NE DOIVENT contenir
     AUCUN lien interne (ni pillar, ni voisin). Les liens vivent dans
     le CORPS de l'article, jamais dans la fermeture.

4. Format : <a href="URL_EXACTE_FOURNIE">ancre courte (3-7 mots)</a>.
   Pas de target/rel/class/style. L'URL doit être copiée À LA LETTRE
   depuis la spec fournie ci-dessous, jamais modifiée.

5. DISTRIBUTION : 1 lien par paragraphe maximum. Liens RÉPARTIS dans
   l'article (pas plus d'un dans les 2 premiers paragraphes, pas tous
   concentrés dans une même section H2).

6. Ancres VARIÉES : jamais 2 ancres identiques. Varie verbe / nom /
   expression d'un lien à l'autre.

7. 1 lien max par couple (source → cible). Pas 2 liens vers la même URL.
"""

SILO_RULES_SATELLITE = """
RÔLE : article satellite d'un silo.

PILIER (URL exacte) : {pillar_url}
→ 1 lien OBLIGATOIRE vers cette URL, OBLIGATOIREMENT placé dans l'un des
  3 PREMIERS paragraphes <p> de l'article (introduction comprise).
  PAS dans un H2, PAS dans une liste, PAS dans un tableau, PAS après le
  3ème <p>, PAS dans une section finale.
→ Si l'introduction existante ne se prête pas à l'intégration, REFORMULE
  l'intro pour qu'elle pose le contexte du pilier — sans citer textuellement
  l'URL ni dire "voir le pilier".
→ Ancre = pivot sémantique court qui décrit le sujet du pilier (3-7 mots).
→ NON-NÉGOCIABLE. Vérifié automatiquement après génération.

VOISINS DU MÊME SILO ({peer_count}) — TOUS OBLIGATOIRES :
{peer_block}
→ Pour CHAQUE voisin ci-dessus : 1 <a href="URL"> avec ancre contextuelle
  obligatoirement présent dans le CORPS de l'article (entre le 4ème <p>
  et l'avant-avant-dernier <p>). Vérifié automatiquement après génération.
→ Si le sujet d'un voisin n'apparaît pas naturellement dans le plan
  existant, AJOUTE 1-2 phrases (à l'intérieur d'un paragraphe existant
  pertinent) qui amènent le sujet en pivot — par exemple :
    "Les outils {{spécifiques au voisin}} demandent une approche
    différente : on a creusé <a href='URL'>{{sujet du voisin}}</a> en
    détail." ← intégré dans un paragraphe existant, PAS un paragraphe
    autonome de fin d'article.
→ Ancres VARIÉES : 3-7 mots qui décrivent DE QUOI parle le voisin (pas
  d'appel à l'action). Une ancre différente par voisin.
→ Dispersion OBLIGATOIRE : si tu as 3 voisins, ils doivent atterrir dans
  3 paragraphes DIFFÉRENTS et non-adjacents. Jamais 2 voisins consécutifs.
→ INTERDIT : paragraphe de fin d'article qui regroupe plusieurs voisins
  ("Comparez aussi avec X et découvrez Y" = REJET de la génération).
"""

SILO_RULES_PILLAR = """
RÔLE : page pilier. Vue d'ensemble + introduit CHAQUE sous-thème + pousse
vers son satellite dédié.

SATELLITES :
{satellite_block}

IMPÉRATIF — pour CHAQUE satellite ci-dessus :
- 1 section ou paragraphe (2-4 phrases) qui présente le sous-thème
- ET contient EXACTEMENT 1 <a href="URL_SATELLITE">ancre contextuelle</a>
  au fil du texte (jamais "voir l'article").
- Aucun satellite sans son lien. Ne mentionne pas l'existence d'un "article
  dédié" : le lien parle seul.
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
        peers = link_manifest.get("peer_links") or []
        peer_block = _format_satellite_block(peers)
        return (
            "\n\n=== CONTEXTE SILO ===\n"
            + SILO_RULES_COMMON
            + SILO_RULES_SATELLITE.format(
                pillar_url=link_manifest.get("pillar_url", ""),
                peer_block=peer_block,
                peer_count=len(peers),
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
    paa: list[str] | None = None,
    competitors_breakdown: list[dict] | None = None,
    format_brief: str | None = None,
) -> Generated:
    system = SYSTEM_TEMPLATE.format(
        type_brief=PROMPTS.get(content_type, PROMPTS["blog"]),
        rules=EDITORIAL_RULES,
    )
    # Topical concepts the SERP corpus revolves around. NO frequency
    # targets — that approach pushed Claude to verbatim stuffing
    # ("Webflow tarif simple", "facteurs influençant prix Webflow"). The
    # 2026 SOTA is to surface the concepts and trust the model to weave
    # them in naturally when the topic warrants it.
    def _format_target(t: dict) -> str:
        term = t.get("term", "").strip()
        if not term:
            return ""
        return term

    targets_text = (
        ", ".join(filter(None, (_format_target(t) for t in (term_targets or [])[:25])))
        if term_targets
        else "(non calculé)"
    )

    user = USER_TEMPLATE.format(
        today=datetime.utcnow().strftime("%d %B %Y"),
        keyword=keyword,
        intent=intent,
        content_type=content_type,
        domain=domain or "(aucun)",
        format_block=_format_block(format_brief),
        listicle_block=_listicle_block(keyword, blueprint),
        paa_block=_paa_block(paa),
        competitors_block=_competitors_block(competitors_breakdown),
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


# ---------------------------------------------------------------------------
# Refinement pass (optional, opt-in per job)
# ---------------------------------------------------------------------------

REFINE_SYSTEM = """Rédacteur web FR senior — rôle de RELECTEUR exigeant. Tu reçois
un article fraîchement écrit + son brief de génération. Ta mission :

1. IDENTIFIER 3 à 5 défauts CONCRETS dans l'article : passages flous, paragraphes
   trop similaires en longueur, redites, expressions IA détectables, intro
   promotionnelle, casse de titres incorrecte, listes faibles, manque de
   chiffres ou d'exemples, FAQ générique, etc.
2. RÉÉCRIRE ces passages localement, en gardant intact le reste de l'article.

Tu rends le RÉSULTAT FINAL en JSON strict avec le HTML réécrit en intégralité
(pas de diff, l'article complet remplacé) :
{
  "html": "<h1>...</h1>...",
  "issues_fixed": ["intro promo", "paragraphes uniformes section 2", ...]
}

Règles :
- Conserve les liens <a href="…"> existants à l'identique (URLs ET ancres).
- Conserve la structure des sections (mêmes H2/H3) sauf si un défaut explicitement
  identifié exige de la modifier.
- Conserve les chiffres, marques, données factuelles citées.
- Continue d'appliquer toutes les règles éditoriales de la 1ère passe (anti-IA,
  rythme, paragraphes variés, casse correcte des titres).
- Ne remplace JAMAIS un fait par une formule plus vague ; toujours plus précis.
"""


async def refine_content(
    *,
    keyword: str,
    intent: str,
    blueprint: dict,
    html: str,
    use_haiku: bool = False,
) -> tuple[str, list[str], float]:
    """2nd pass : Claude critiques its own output and rewrites weak passages.
    Returns (refined_html, list_of_issues_fixed, cost). The caller decides
    whether to keep the refined version (always, in our case)."""
    user = (
        f"Mot-clé cible : {keyword}\n"
        f"Intent : {intent}\n"
        f"Cible mots : {blueprint.get('target_words', 1500)}\n\n"
        f"Brief (blueprint) :\n{json.dumps(blueprint, ensure_ascii=False, indent=2)}\n\n"
        f"Article à relire et améliorer :\n{html}\n\n"
        "Identifie 3-5 défauts concrets, réécris UNIQUEMENT les passages qui en\n"
        "ont besoin, et rends l'article complet en JSON strict comme spécifié."
    )
    model = llm.HAIKU if use_haiku else llm.SONNET
    resp = await llm.complete(
        system=REFINE_SYSTEM,
        user=user,
        max_tokens=12000,
        temperature=0.45,
        model=model,
    )
    data = llm.extract_json(resp.text)
    refined = str(data.get("html", "")).strip()
    issues = list(data.get("issues_fixed", []))
    if len(refined) < 400 or "<h" not in refined.lower():
        # Refinement broke the article — fall back to the original
        return html, [], resp.cost
    return refined, issues, resp.cost


# ---------------------------------------------------------------------------
# Schema.org JSON-LD generation
# ---------------------------------------------------------------------------


def build_jsonld(
    *,
    chosen_title: str | None,
    chosen_meta: str | None,
    html: str,
    domain: str | None,
    slug: str | None,
    image_url: str | None,
    published_iso: str | None,
    author_name: str | None,
    types: list[str] | None,
) -> list[dict]:
    """Build a clean schema.org JSON-LD payload (Article + FAQPage if FAQ
    section detected). No breadcrumb (per user spec)."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html or "", "html.parser")
    out: list[dict] = []

    url = None
    if domain and slug:
        host = domain.rstrip("/")
        if not host.startswith(("http://", "https://")):
            host = f"https://{host}"
        url = f"{host.rstrip('/')}/{slug.lstrip('/')}"

    # Article schema
    article: dict = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": chosen_title or "",
        "description": chosen_meta or "",
    }
    if url:
        article["mainEntityOfPage"] = {"@type": "WebPage", "@id": url}
        article["url"] = url
    if image_url:
        article["image"] = image_url
    if published_iso:
        article["datePublished"] = published_iso
        article["dateModified"] = published_iso
    if author_name:
        article["author"] = {"@type": "Person", "name": author_name}
    out.append(article)

    # FAQPage if we can detect a FAQ section (H3 questions ending in '?'
    # under an H2 that contains "FAQ" or "questions"). Scoped to keep it
    # honest — false-positives on FAQPage hurt rankings.
    faq_pairs: list[tuple[str, str]] = []
    headings = soup.find_all(["h2", "h3"])
    in_faq = False
    cur_q: str | None = None
    cur_a_parts: list[str] = []

    def _flush():
        nonlocal cur_q, cur_a_parts
        if cur_q and cur_a_parts:
            faq_pairs.append((cur_q, " ".join(p.strip() for p in cur_a_parts).strip()))
        cur_q, cur_a_parts = None, []

    for el in soup.body.descendants if soup.body else []:
        name = getattr(el, "name", None)
        if not name:
            continue
        if name == "h2":
            _flush()
            text = el.get_text(" ", strip=True).lower()
            in_faq = ("faq" in text) or ("questions" in text and "fréquentes" in text) or ("foire aux" in text)
            continue
        if not in_faq:
            continue
        if name == "h3":
            _flush()
            qtext = el.get_text(" ", strip=True)
            if qtext.endswith("?") or qtext.endswith(" ?") or "?" in qtext:
                cur_q = qtext
        elif name == "p" and cur_q:
            cur_a_parts.append(el.get_text(" ", strip=True))
    _flush()

    if faq_pairs:
        out.append({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
                for q, a in faq_pairs
            ],
        })

    return out
