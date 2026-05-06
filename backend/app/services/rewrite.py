"""Per-section regeneration AND full-content rewrite-with-SERP-context.

Two flows in this module :
- regenerate_section() : ré-écrit UNE section H2 d'un contenu existant via Claude
  et splice le HTML en place (utilisé via /api/contents/.../regenerate-section).
- rewrite_with_context() : prend un contenu existant + le rapport sémantique d'un
  job en mode="rewrite" et produit une version enrichie qui couvre les gaps,
  intègre les required_terms, et corrige les défauts éditoriaux.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from bs4 import BeautifulSoup, Tag

from app.db import SessionLocal
from app.models import Content, Domain, Job
from app.services import llm
from app.services.generator import EDITORIAL_RULES

# ---------- single-section regeneration (called from the editor sidebar) ----------

SECTION_SYSTEM = (
    "Tu réécris UNE seule section d'un article. Tu reçois la section actuelle + "
    "les autres titres H2 de l'article (pour anti-redondance).\n\n"
    "Garde le H2 (tu peux le reformuler), respecte la même intention, ne répète "
    "pas ce qui est dit ailleurs. HTML propre.\n\n"
    f"{EDITORIAL_RULES}\n\n"
    "Réponds UNIQUEMENT avec le HTML de la section (commence par <h2 id=...>), "
    "pas de bloc de code, pas de préambule."
)


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

    target = _extract_section_html(full_html, section_id)
    if target is None:
        raise RuntimeError(f"section {section_id} introuvable")
    others = _list_other_sections(full_html, section_id)

    user = (
        f"Mot-clé : {keyword}\n"
        f"Intent : {intent}\n"
        f"Domaine : {domain_host or '(aucun)'}\n\n"
        f"Section actuelle (HTML) :\n{target}\n\n"
        f"Autres titres H2 de l'article (anti-redondance) :\n"
        + "\n".join(f"- {h}" for h in others)
    )
    resp = await llm.complete(system=SECTION_SYSTEM, user=user, max_tokens=2000, temperature=0.6)
    new_html_section = _normalize_section(_strip_code_fences(resp.text).strip(), section_id)
    new_full = _splice_section(full_html, section_id, new_html_section)

    async with SessionLocal() as session:
        c = await session.get(Content, content_id)
        if c is not None:
            c.html = new_full
            await session.commit()
    return RegenResult(new_html=new_full, cost=resp.cost)


# ---------- full content rewrite using SERP analysis ----------

REWRITE_SYSTEM = (
    "Tu reçois un contenu existant qui doit être amélioré (obsolète, sous-performant, "
    "ou pas assez exhaustif), accompagné d'une analyse SERP fraîche du mot-clé cible.\n\n"
    "Ta mission : RÉÉCRIRE ce contenu en l'enrichissant avec ce que la SERP apporte, "
    "en corrigeant son ton et ses faiblesses, MAIS sans repartir de zéro.\n\n"
    "Règle ratio 70/30 : 70 % du texte final doit être structurellement différent du "
    "source (nouvelles phrases, nouvelles transitions, nouvelle organisation). 30 % "
    "peut reprendre des éléments du source (chiffres, marques, citations, faits "
    "vérifiables). Tu ne fais PAS du paraphrasage de surface.\n\n"
    "Ce qui doit changer obligatoirement :\n"
    "- Combler les content_gaps signalés par la SERP.\n"
    "- Intégrer les required_terms et entities qui manquent.\n"
    "- Corriger tout marqueur IA présent dans le source (voir règles ci-dessous).\n"
    "- Aligner la structure H2/H3 sur les attentes SERP (respecter le blueprint si fourni).\n"
    "- Adapter la longueur à la cible.\n\n"
    "Ce qui doit être préservé :\n"
    "- Tous les faits chiffrés, marques, dates, normes du source.\n"
    "- Le mot-clé principal dans H1 + 1er paragraphe + 2-3 H2.\n"
    "- Les liens internes existants (ancre + URL) si présents.\n\n"
    f"{EDITORIAL_RULES}\n\n"
    "Réponds en JSON strict :\n"
    "{\n"
    '  "title_variants": [{"title":"...","meta":"..."}, ...3 entrées],\n'
    '  "html": "<h1>...</h1>...",\n'
    '  "schema_recommendations": {"types": ["Article","FAQPage"]},\n'
    '  "image_prompt": "..."\n'
    "}"
)


REWRITE_USER_TEMPLATE = """Date du jour : {today} (utilise cette date comme référence ; ne mentionne JAMAIS une année passée comme si c'était l'année courante).

Mot-clé cible : {keyword}
Intent : {intent}
Domaine : {domain}
Cible mots : {target_words}

Contenu source à réécrire / enrichir (HTML brut) :
{source}

Insights SERP :
- Termes obligatoires : {required_terms}
- Entités à mentionner : {entities}
- Content gaps à combler : {gaps}
- Cibles de fréquence par terme :
{term_targets}

Réponds en JSON strict.
"""


@dataclass
class RewriteResult:
    title_variants: list[dict[str, str]]
    html: str
    schema_recommendations: dict
    image_prompt: str
    cost: float


async def rewrite_with_context(
    *,
    keyword: str,
    intent: str,
    domain: str | None,
    target_words: int,
    source_html: str,
    required_terms: list[str],
    entities: list[str],
    content_gaps: list[str],
    term_targets: list[dict],
    capture: dict | None = None,
) -> RewriteResult:
    targets_text = (
        "\n".join(
            f"- {t.get('term')} : ~{t.get('target')} (entre {t.get('min')} et {t.get('max')})"
            for t in term_targets[:25]
        )
        or "(non calculé)"
    )
    user = REWRITE_USER_TEMPLATE.format(
        today=datetime.utcnow().strftime("%d %B %Y"),
        keyword=keyword,
        intent=intent,
        domain=domain or "(aucun)",
        target_words=target_words,
        source=source_html,
        required_terms=", ".join(required_terms[:30]) or "(aucun)",
        entities=", ".join(entities[:20]) or "(aucune)",
        gaps="; ".join(content_gaps[:10]) or "(aucun)",
        term_targets=targets_text,
    )
    resp = await llm.complete(system=REWRITE_SYSTEM, user=user, max_tokens=8000, temperature=0.55)
    if capture is not None:
        capture.update(system=REWRITE_SYSTEM, user=user, model=llm.SONNET, cost=resp.cost)
    data = llm.extract_json(resp.text)
    return RewriteResult(
        title_variants=list(data.get("title_variants", []))[:3],
        html=str(data.get("html", "")),
        schema_recommendations=dict(data.get("schema_recommendations", {})),
        image_prompt=str(data.get("image_prompt", "")),
        cost=resp.cost,
    )


# ---------- HTML splice helpers (tested in tests/unit/test_regenerate_splice.py) ----------


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
        return full_html

    target_h2: Tag | None = None
    for h2 in soup.find_all("h2"):
        sid = h2.get("id") or _slugify(h2.get_text())
        if sid == section_id:
            target_h2 = h2
            break
    if target_h2 is None:
        return full_html

    to_remove: list[Tag] = []
    for sib in target_h2.find_all_next():
        if sib.name == "h2" and sib is not target_h2:
            break
        if sib.find_parent("h2") is not None:
            continue
        to_remove.append(sib)

    new_nodes: list[Tag] = [new_h2]
    for sib in new_h2.find_all_next():
        new_nodes.append(sib)

    insertion_point = target_h2
    for node in new_nodes:
        insertion_point.insert_before(node.extract() if node.parent else node)

    target_h2.decompose()
    for n in to_remove:
        if n.parent is not None:
            n.decompose()
    return str(soup)


def _normalize_section(html: str, expected_id: str) -> str:
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
