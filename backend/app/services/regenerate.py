"""Per-section regeneration: rewrite a single H2 section in place via Claude."""
from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from bs4 import BeautifulSoup, Tag

from app.db import SessionLocal
from app.models import Content, Domain, Job
from app.services import llm

SYSTEM = """Tu es un rédacteur SEO senior francophone. On te demande de RÉÉCRIRE une seule
section d'un article existant, en respectant strictement :

- garder le H2 d'origine (mais tu peux le reformuler si pertinent)
- garder la même intention que l'article global
- pas de redondance avec les autres sections (qu'on te fournit en contexte)
- HTML propre : <h2>, <h3>, <p>, <ul>, <ol>, <table>, <strong>, <em>
- pas de markdown, pas de bavardage, pas de "voici la section réécrite"
- une seule section : tu commences par <h2 id="..."> et tu finis avant le H2 suivant

Réponds UNIQUEMENT avec le HTML de la section, sans bloc de code, sans préambule."""


@dataclass
class RegenResult:
    new_html: str
    cost: float


async def regenerate_section(content_id: UUID, section_id: str) -> RegenResult:
    async with SessionLocal() as session:
        content = await session.get(Content, content_id)
        if content is None or not content.html:
            raise RuntimeError("content not found or empty")
        keyword = content.keyword
        intent = content.intent or "informational"
        domain_host = None
        if content.domain_id:
            d = await session.get(Domain, content.domain_id)
            domain_host = d.hostname if d else None
        full_html = content.html

    target_section = _extract_section_html(full_html, section_id)
    if target_section is None:
        raise RuntimeError(f"section {section_id} not found")

    other_sections = _list_other_sections(full_html, section_id)

    user = (
        f"Mot-clé: {keyword}\n"
        f"Intent: {intent}\n"
        f"Domaine cible: {domain_host or '(aucun)'}\n\n"
        f"Section à réécrire (HTML actuel):\n{target_section}\n\n"
        f"Autres sections de l'article (titres uniquement, pour éviter la redondance):\n"
        + "\n".join(f"- {h}" for h in other_sections)
    )

    resp = await llm.complete(system=SYSTEM, user=user, max_tokens=2000, temperature=0.6)
    new_section_html = _strip_code_fences(resp.text).strip()
    new_section_html = _normalize_section(new_section_html, section_id)

    new_full_html = _splice_section(full_html, section_id, new_section_html)

    async with SessionLocal() as session:
        c = await session.get(Content, content_id)
        if c is not None:
            c.html = new_full_html
            await session.commit()

    return RegenResult(new_html=new_full_html, cost=resp.cost)


def add_cost_to_job(job: Job, cost: float) -> None:
    job.cost_actual = float(job.cost_actual or 0) + cost


def _extract_section_html(full_html: str, section_id: str) -> str | None:
    soup = BeautifulSoup(full_html, "html.parser")
    for h2 in soup.find_all("h2"):
        sid = h2.get("id") or _slugify(h2.get_text())
        if sid != section_id:
            continue
        parts: list[str] = [str(h2)]
        for sib in h2.find_all_next():
            if sib.name == "h2" and sib is not h2:
                break
            if sib.find_parent("h2") is not None:
                continue
            # only direct content following h2 until next h2
            if sib.parent and sib.parent.name in {"body", "[document]"}:
                parts.append(str(sib))
        return "".join(parts)
    return None


def _list_other_sections(full_html: str, except_section_id: str) -> list[str]:
    soup = BeautifulSoup(full_html, "html.parser")
    out: list[str] = []
    for h2 in soup.find_all("h2"):
        sid = h2.get("id") or _slugify(h2.get_text())
        if sid == except_section_id:
            continue
        out.append(h2.get_text(strip=True))
    return out


def _splice_section(full_html: str, section_id: str, new_section_html: str) -> str:
    soup = BeautifulSoup(full_html, "html.parser")
    new_fragment = BeautifulSoup(new_section_html, "html.parser")
    new_h2 = new_fragment.find("h2")
    if new_h2 is None:
        # Claude didn't return a clean section; abort splice.
        return full_html

    target_h2: Tag | None = None
    for h2 in soup.find_all("h2"):
        sid = h2.get("id") or _slugify(h2.get_text())
        if sid == section_id:
            target_h2 = h2
            break
    if target_h2 is None:
        return full_html

    # Remove all siblings until next h2
    to_remove: list[Tag] = []
    for sib in target_h2.find_all_next():
        if sib.name == "h2" and sib is not target_h2:
            break
        if sib.find_parent("h2") is not None:
            continue
        to_remove.append(sib)

    # Build new nodes in order: new <h2> + everything after it inside the fragment
    new_nodes: list[Tag] = [new_h2]
    for sib in new_h2.find_all_next():
        new_nodes.append(sib)

    # Insert new nodes before the original h2
    insertion_point = target_h2
    for node in new_nodes:
        insertion_point.insert_before(node.extract() if node.parent else node)

    # Remove old target h2 + trailing siblings
    target_h2.decompose()
    for n in to_remove:
        if n.parent is not None:
            n.decompose()

    return str(soup)


def _normalize_section(html: str, expected_id: str) -> str:
    """Ensure the H2 has the right id attribute."""
    soup = BeautifulSoup(html, "html.parser")
    h2 = soup.find("h2")
    if h2 is not None and not h2.get("id"):
        h2["id"] = expected_id
    return str(soup)


def _strip_code_fences(text: str) -> str:
    m = re.search(r"```(?:html)?\s*(.*?)\s*```", text, flags=re.DOTALL)
    return m.group(1) if m else text


def _slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"\s+", "-", text.strip())
