"""Internal linking: section-by-section kNN match against domain index, Claude-validated anchors."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from uuid import UUID

from bs4 import BeautifulSoup, Tag
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IndexedPage
from app.services import llm
from app.services.embeddings import embed

ANCHOR_SYSTEM = """Tu es un éditeur SEO. On te donne le texte d'une section d'article et un
résumé de page candidate cible. Tu décides s'il existe une ancre naturelle pour insérer un
lien vers la cible. Si oui, tu retournes l'ancre exacte (3-7 mots, présente dans le texte
ou très proche d'une expression du texte) et la position d'insertion (numéro de paragraphe,
0-indexed).

Réponds en JSON strict :
{"insert": true|false, "anchor": "...", "paragraph_index": 0, "reason": "..."}"""


@dataclass
class LinkSuggestion:
    section_id: str
    anchor: str
    target_url: str
    target_title: str | None
    similarity: float
    paragraph_index: int


async def suggest_links(
    db: AsyncSession,
    *,
    content_html: str,
    content_id: UUID | None,
    domain_id: UUID,
    k: int = 5,
    min_sim: float = 0.75,
    max_per_target: int = 2,
) -> list[LinkSuggestion]:
    sections = _extract_sections(content_html)
    if not sections:
        return []

    section_embeddings = await embed([s["text"] for s in sections])

    suggestions: list[LinkSuggestion] = []
    target_use_count: dict[str, int] = {}

    for section, vec in zip(sections, section_embeddings):
        stmt = (
            select(
                IndexedPage.id,
                IndexedPage.url,
                IndexedPage.title,
                IndexedPage.h1,
                IndexedPage.first_paragraph,
                (1 - IndexedPage.embedding.cosine_distance(vec)).label("sim"),
            )
            .where(IndexedPage.domain_id == domain_id)
            .where(IndexedPage.embedding.is_not(None))
        )
        if content_id is not None:
            stmt = stmt.where(IndexedPage.content_id != content_id)
        stmt = stmt.order_by(IndexedPage.embedding.cosine_distance(vec)).limit(k)

        rows = (await db.execute(stmt)).all()
        for _id, url, title, h1, first_paragraph, sim in rows:
            sim_f = float(sim)
            if sim_f < min_sim:
                continue
            if target_use_count.get(url, 0) >= max_per_target:
                continue
            anchor_decision = await _decide_anchor(
                section_text=section["text"],
                paragraphs=section["paragraphs"],
                target_url=url,
                target_title=title or h1 or url,
                target_summary=first_paragraph or "",
            )
            if not anchor_decision.get("insert"):
                continue
            anchor = (anchor_decision.get("anchor") or "").strip()
            if not anchor:
                continue
            suggestions.append(
                LinkSuggestion(
                    section_id=section["id"],
                    anchor=anchor,
                    target_url=url,
                    target_title=title or h1,
                    similarity=round(sim_f, 4),
                    paragraph_index=int(anchor_decision.get("paragraph_index", 0)),
                )
            )
            target_use_count[url] = target_use_count.get(url, 0) + 1
            break  # one link per section max
    return suggestions


def insert_links(html: str, suggestions: list[LinkSuggestion]) -> str:
    if not suggestions:
        return html
    soup = BeautifulSoup(html, "lxml")
    by_section = {s.section_id: s for s in suggestions}

    for h2 in soup.find_all("h2"):
        sid = h2.get("id") or _slugify(h2.get_text())
        sug = by_section.get(sid)
        if not sug:
            continue
        # Walk forward siblings (paragraphs only) until next h2
        paragraphs: list[Tag] = []
        for sib in h2.find_all_next():
            if sib.name == "h2":
                break
            if sib.name == "p":
                paragraphs.append(sib)
        if not paragraphs:
            continue
        idx = min(sug.paragraph_index, len(paragraphs) - 1)
        target_p = paragraphs[idx]
        if _inject_anchor(target_p, sug.anchor, sug.target_url):
            continue
        # Fallback: try other paragraphs
        for p in paragraphs:
            if _inject_anchor(p, sug.anchor, sug.target_url):
                break
    return str(soup)


async def _decide_anchor(
    *,
    section_text: str,
    paragraphs: list[str],
    target_url: str,
    target_title: str,
    target_summary: str,
) -> dict:
    user = (
        f"Section actuelle:\n{section_text[:2500]}\n\n"
        f"Paragraphes (numérotés):\n"
        + "\n".join(f"[{i}] {p[:400]}" for i, p in enumerate(paragraphs))
        + f"\n\nCible:\nURL: {target_url}\nTitre: {target_title}\nRésumé: {target_summary[:400]}"
    )
    resp = await llm.complete(system=ANCHOR_SYSTEM, user=user, max_tokens=300, temperature=0.2)
    try:
        return llm.extract_json(resp.text)
    except (ValueError, json.JSONDecodeError):
        return {"insert": False}


def _extract_sections(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    sections: list[dict] = []
    for h2 in soup.find_all("h2"):
        sid = h2.get("id") or _slugify(h2.get_text())
        paragraphs: list[str] = []
        for sib in h2.find_all_next():
            if sib.name == "h2":
                break
            if sib.name == "p":
                paragraphs.append(sib.get_text(" ", strip=True))
        if not paragraphs:
            continue
        sections.append(
            {
                "id": sid,
                "heading": h2.get_text(strip=True),
                "paragraphs": paragraphs,
                "text": h2.get_text(strip=True) + "\n" + "\n".join(paragraphs),
            }
        )
    return sections


def _inject_anchor(paragraph: Tag, anchor: str, href: str) -> bool:
    from bs4 import NavigableString

    pattern = re.compile(re.escape(anchor), flags=re.IGNORECASE)
    soup = paragraph if paragraph.parent is None else _root_soup(paragraph)

    for descendant in list(paragraph.descendants):
        if not isinstance(descendant, NavigableString):
            continue
        if descendant.parent is not None and descendant.parent.name == "a":
            continue
        s = str(descendant)
        m = pattern.search(s)
        if not m:
            continue
        before = NavigableString(s[: m.start()])
        anchor_tag = soup.new_tag("a", href=href)
        anchor_tag.string = s[m.start() : m.end()]
        after = NavigableString(s[m.end() :])
        descendant.replace_with(before)
        before.insert_after(anchor_tag)
        anchor_tag.insert_after(after)
        return True
    return False


def _root_soup(tag: Tag):
    from bs4 import BeautifulSoup

    cur = tag
    while cur.parent is not None:
        cur = cur.parent
    return cur if isinstance(cur, BeautifulSoup) else BeautifulSoup("", "lxml")


def _slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"\s+", "-", text.strip())
