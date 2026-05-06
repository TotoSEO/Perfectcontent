"""Classify search intent + content format expected by the SERP."""
from __future__ import annotations

import re
from typing import Literal

Intent = Literal["informational", "commercial", "transactional", "navigational"]

# Format = the article SHAPE Google's top results converge on. Drives the
# rendering convention of the generated article (listicle vs how-to vs
# comparator vs guide vs opinion). When we know the format, we can force
# Claude into the right structure instead of letting it default to "guide".
Format = Literal["listicle", "howto", "comparator", "definition", "opinion", "guide"]


def classify_intent(serp_features: list[str], top_titles: list[str]) -> Intent:
    features = set(serp_features)
    titles = " ".join(t.lower() for t in top_titles if t)

    if "shopping" in features or "ads" in features:
        if any(w in titles for w in ("acheter", "buy", "prix", "shop", "commander")):
            return "transactional"
        return "commercial"

    if any(w in titles for w in ("acheter", "buy", "prix bas", "commander", "réserver")):
        return "transactional"

    commercial_signals = ("meilleur", "top", "comparatif", "best", "vs", "avis", "review")
    if any(w in titles for w in commercial_signals):
        return "commercial"

    if "people_also_ask" in features or "featured_snippet" in features:
        return "informational"

    if "knowledge_graph" in features:
        return "navigational"

    return "informational"


# ---------------------------------------------------------------------------
# Format detection
# ---------------------------------------------------------------------------

_LISTICLE_RE = re.compile(r"\b(\d{1,3}|top)\b\s*[\w'’]*\s*(?:meilleur|outils?|astuces?|conseils?|raisons?|étapes?|erreurs?|exemples?|techniques?)", re.IGNORECASE)
_HOWTO_RE   = re.compile(r"\b(comment|how to|comment\s+faire|tutoriel|guide pratique|étape par étape|step by step)\b", re.IGNORECASE)
_COMPARE_RE = re.compile(r"\b(vs|versus|comparatif|comparer|différence|ou|or)\b", re.IGNORECASE)
_DEFINE_RE  = re.compile(r"\b(qu['’]est-ce que|c['’]est quoi|définition|definition|signification|what is)\b", re.IGNORECASE)
_OPINION_RE = re.compile(r"\b(avis|review|notre avis|test|nous avons testé|j['’]ai testé)\b", re.IGNORECASE)


def detect_format(top_titles: list[str], keyword: str = "") -> tuple[Format, dict[str, int]]:
    """Detect the article format the SERP converges on.

    Returns (format, votes_per_format) so the analyzer can show "5/7
    competitors are listicles, you need to be a listicle too" in the report.
    Falls back to "guide" when no clear signal — that's the neutral default.
    """
    votes = {"listicle": 0, "howto": 0, "comparator": 0, "definition": 0, "opinion": 0, "guide": 0}
    haystacks = list(top_titles) + ([keyword] if keyword else [])
    for t in haystacks:
        if not t:
            continue
        if _LISTICLE_RE.search(t):  votes["listicle"] += 1; continue
        if _HOWTO_RE.search(t):     votes["howto"] += 1; continue
        if _COMPARE_RE.search(t):   votes["comparator"] += 1; continue
        if _DEFINE_RE.search(t):    votes["definition"] += 1; continue
        if _OPINION_RE.search(t):   votes["opinion"] += 1; continue
        votes["guide"] += 1

    # Pick the strongest signal. If listicle/howto/comparator/definition has
    # ≥40 % of competitors, lock that. Otherwise stay on "guide".
    n = sum(votes.values()) or 1
    for fmt in ("listicle", "comparator", "howto", "definition", "opinion"):
        if votes[fmt] / n >= 0.4:
            return fmt, votes  # type: ignore[return-value]
    return "guide", votes


FORMAT_BRIEFS: dict[Format, str] = {
    "listicle": (
        "FORMAT IMPOSÉ : LISTICLE. Les concurrents top SERP livrent une liste "
        "numérotée. Tu DOIS faire pareil : H2/H3 numérotés explicitement (1., "
        "2., …), un H par item, intro courte qui annonce le nombre d'items, "
        "conclusion synthétique. Pas d'essai libre."
    ),
    "howto": (
        "FORMAT IMPOSÉ : HOW-TO. Les concurrents top SERP livrent une procédure "
        "étape par étape. Tu DOIS faire pareil : H2 = étape (\"Étape 1 — …\", "
        "\"Étape 2 — …\"), une instruction par paragraphe, ouverture qui pose "
        "le problème, fermeture qui valide le résultat attendu."
    ),
    "comparator": (
        "FORMAT IMPOSÉ : COMPARATIF. Les concurrents top SERP comparent deux ou "
        "plusieurs solutions. Tu DOIS livrer un tableau comparatif <table> dans "
        "les 3 premières sections, avec critères en colonnes (prix, feature, "
        "cible, etc.) et solutions en lignes. Verdict par cas d'usage en "
        "conclusion (\"X pour les freelances, Y pour les agences\")."
    ),
    "definition": (
        "FORMAT IMPOSÉ : DÉFINITION + APPROFONDISSEMENT. Les concurrents top "
        "SERP répondent à un \"qu'est-ce que X\". Tu DOIS livrer la définition "
        "claire dans le 1er paragraphe (≤ 50 mots), puis approfondir : origine, "
        "fonctionnement, cas d'usage, alternatives, FAQ. Pas de listicle."
    ),
    "opinion": (
        "FORMAT IMPOSÉ : AVIS / TEST. Les concurrents top SERP partagent un "
        "retour terrain. Tu DOIS prendre position dès l'intro (verdict en 1-2 "
        "phrases), justifier avec preuves concrètes, lister forces/faiblesses, "
        "et recommander ou déconseiller en conclusion. Ton subjectif assumé."
    ),
    "guide": (
        "FORMAT : GUIDE complet. Pas de format dominant détecté en SERP. "
        "Structure libre adaptée au sujet : intro, sections logiques, conclusion."
    ),
}
