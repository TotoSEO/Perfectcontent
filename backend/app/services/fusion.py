"""Fusion de N contenus qui se cannibalisent en un seul article unifié.

Pas de SERP, pas de scraping. On prend des HTML/Markdown collés depuis des
pages existantes (donc avec H1-H6, strong, em, listes, tableaux, blockquotes)
et on fusionne intelligemment via Claude.
"""
from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup

from app.services import llm
from app.services.generator import EDITORIAL_RULES

ALLOWED_TAGS = {
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "ul", "ol", "li",
    "strong", "em", "b", "i",
    "table", "thead", "tbody", "tr", "th", "td",
    "blockquote", "code", "br",
}


@dataclass
class FusionResult:
    title: str
    meta: str
    html: str
    cost: float


def sanitize_html(raw: str) -> str:
    """Strip everything except whitelisted tags. Keep text content."""
    soup = BeautifulSoup(raw, "lxml")
    for tag in soup.find_all(True):
        if tag.name not in ALLOWED_TAGS:
            tag.unwrap()
        else:
            tag.attrs = {}
    return str(soup)


SYSTEM = (
    "Tu es rédacteur web français senior. Tu reçois plusieurs contenus existants qui "
    "se cannibalisent (ils visent le même mot-clé sur le même domaine et se concurrencent "
    "inutilement). Ta mission : les FUSIONNER en UN seul contenu unifié.\n\n"
    "Ce n'est PAS une réécriture : c'est une SYNTHÈSE INTÉGRATIVE. Tu dois :\n"
    "- Garder TOUTES les informations utiles présentes dans au moins un des contenus.\n"
    "- Supprimer les redondances inter-contenus (si X est dit dans 2 contenus, ne le dis "
    "qu'une fois, à l'endroit qui a le plus de sens dans la nouvelle structure).\n"
    "- Préserver les chiffres, marques, faits, citations exacts.\n"
    "- Recomposer une structure H2/H3 logique qui couvre tout le sujet sans doublon.\n"
    "- Conserver les tableaux et listes utiles (en les fusionnant si besoin).\n"
    "- Ne JAMAIS inventer de fait absent des sources.\n\n"
    f"{EDITORIAL_RULES}\n\n"
    "Réponds en JSON strict :\n"
    "{\n"
    '  "title": "...",       // 50-60 chars\n'
    '  "meta":  "...",       // 140-160 chars\n'
    '  "html":  "<h1>...</h1>..."  // contenu fusionné, HTML propre\n'
    "}"
)


USER_TEMPLATE = """Mot-clé cible (pour calibrer le SEO) : {keyword}

Contenus à fusionner ({n} sources) :

{sources}

Produis le contenu fusionné en JSON strict. Aucun fait inventé."""


async def fuse_contents(*, keyword: str, sources: list[str]) -> FusionResult:
    cleaned = [sanitize_html(s) for s in sources if s.strip()]
    if len(cleaned) < 2:
        raise ValueError("au moins 2 contenus sont requis pour la fusion")

    blocks = "\n\n".join(
        f"────── SOURCE {i + 1} ──────\n{s}" for i, s in enumerate(cleaned)
    )
    user = USER_TEMPLATE.format(keyword=keyword, n=len(cleaned), sources=blocks)

    resp = await llm.complete(system=SYSTEM, user=user, max_tokens=8000, temperature=0.5)
    data = llm.extract_json(resp.text)
    return FusionResult(
        title=str(data.get("title", "")),
        meta=str(data.get("meta", "")),
        html=str(data.get("html", "")),
        cost=resp.cost,
    )
