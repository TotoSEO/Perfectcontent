"""Fusion de N contenus qui se cannibalisent en un seul article unifié.

Pas de SERP, pas de scraping. On prend des HTML/Markdown collés depuis des
pages existantes (donc avec H1-H6, strong, em, listes, tableaux, blockquotes)
et on fusionne intelligemment via Claude.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from bs4 import BeautifulSoup

from app.services import llm
from app.services.generator import EDITORIAL_RULES

ALLOWED_TAGS = {
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "ul", "ol", "li",
    "strong", "em", "b", "i", "u",
    "table", "thead", "tbody", "tr", "th", "td",
    "blockquote", "code", "br", "a",
}
DROP_TAGS = {"script", "style", "noscript", "iframe", "img", "svg", "form", "input", "button"}
# When pasting from a web page, browsers wrap line-level content in <div>.
# Convert these to <p> so paragraph structure survives sanitization.
DIV_TO_P = True


@dataclass
class FusionResult:
    title: str
    meta: str
    html: str
    cost: float


def sanitize_html(raw: str) -> str:
    """Whitelist-based HTML sanitizer that preserves structure from web pastes.

    Rules:
    - drop script/style/iframe/img/etc. entirely (with their content)
    - convert <div> to <p> so paragraph structure survives a browser paste
    - strip everything else not in the whitelist (unwrap, keep text)
    - drop ALL attributes except href on <a>
    - collapse whitespace
    """
    if not raw or not raw.strip():
        return ""
    soup = BeautifulSoup(raw, "html.parser")

    for tag in soup.find_all(True):
        if tag.name in DROP_TAGS:
            tag.decompose()
            continue
        if DIV_TO_P and tag.name == "div":
            # Heuristic: if a div contains any block-level child, just unwrap
            # (the children carry their own structure). Otherwise treat as a
            # paragraph.
            has_block_child = any(
                getattr(c, "name", None)
                in {"h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "table", "blockquote", "div"}
                for c in tag.children
            )
            if has_block_child:
                tag.unwrap()
            else:
                tag.name = "p"
                tag.attrs = {}
            continue
        if tag.name in ALLOWED_TAGS:
            if tag.name == "a":
                href = tag.get("href")
                tag.attrs = {"href": href} if href else {}
            else:
                tag.attrs = {}
        else:
            tag.unwrap()

    # Drop empty paragraphs left over from cleanup
    for p in soup.find_all("p"):
        if not p.get_text(strip=True):
            p.decompose()

    return str(soup).strip()


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


USER_TEMPLATE = """Date du jour : {today} (utilise cette date comme référence ; ne mentionne JAMAIS une année passée comme si c'était l'année courante).

Mot-clé cible (pour calibrer le SEO) : {keyword}

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
    user = USER_TEMPLATE.format(
        today=datetime.utcnow().strftime("%d %B %Y"),
        keyword=keyword,
        n=len(cleaned),
        sources=blocks,
    )

    resp = await llm.complete(system=SYSTEM, user=user, max_tokens=8000, temperature=0.5)
    data = llm.extract_json(resp.text)
    return FusionResult(
        title=str(data.get("title", "")),
        meta=str(data.get("meta", "")),
        html=str(data.get("html", "")),
        cost=resp.cost,
    )
