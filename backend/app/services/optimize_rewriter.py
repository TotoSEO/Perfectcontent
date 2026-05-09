"""Claude-driven keyword integrator.

Uses the user's verbatim prompt: integrate the picked GSC keywords into the
existing content WITHOUT rewriting it, WITHOUT changing the structure, only
finding natural insertion points. Up to two extra paragraphs allowed if no
natural spot exists, but they must be relevant, well-placed, and not
duplicate existing content.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services import llm
from app.services.html_sanitize import sanitize_html


SYSTEM = (
    "Tu es un éditeur SEO senior dont la seule tâche est d'INTÉGRER des mots-clés "
    "dans un contenu existant. Tu ne réécris JAMAIS le contenu. Tu n'altères "
    "JAMAIS la structure (mêmes H1/H2/H3, même ordre, même découpage en "
    "paragraphes). Tu cherches des endroits où les mots-clés peuvent s'insérer "
    "naturellement — par substitution d'un synonyme, par reformulation locale "
    "d'une phrase pour y introduire le terme, ou par ajout léger. Si vraiment "
    "aucune intégration naturelle n'est possible, tu peux ajouter UN ou DEUX "
    "paragraphes au maximum, à condition qu'ils soient pertinents, placés au "
    "bon endroit dans la progression de l'article, et qu'ils ne répètent rien "
    "qui existe déjà.\n\n"
    "RÈGLES STRICTES POUR LE FORMAT HTML :\n"
    "- Conserve EXACTEMENT toutes les balises (<h1>, <h2>, <h3>, <p>, <ul>, "
    "  <ol>, <li>, <table>, <tr>, <td>, <strong>, <em>, <blockquote>, etc.).\n"
    "- Conserve EXACTEMENT tous les liens <a href=\"...\"> avec leur URL "
    "  intacte. Ne modifie JAMAIS une URL. Ne supprime JAMAIS un lien interne.\n"
    "- Conserve EXACTEMENT toutes les balises <img> avec leur src et alt.\n"
    "- Conserve la hiérarchie des titres et l'ordre des sections.\n"
    "- N'ajoute aucun commentaire HTML, aucun attribut class/style/id.\n\n"
    "Réponds avec UNIQUEMENT le contenu modifié — pas d'introduction, pas de "
    "récapitulatif, pas de commentaire entre crochets. Garde exactement le "
    "format d'entrée (HTML si HTML, texte plain si texte plain)."
)


USER_TEMPLATE = """\
Sans faire de réécriture complète de la page, tu vas devoir intégrer
naturellement ces termes exacts ou de manière semi-exacte dans le contenu.

Tu as interdiction de modifier la structure ou réécrire le contenu dans sa
globalité.

Ton seul rôle est de trouver les endroits où les mots-clés peuvent être
intégrés de manière naturelle.

Dans l'éventualité où il n'y a aucun endroit où ajouter quelques mots-clés,
tu as le droit d'ajouter un ou deux paragraphes, mais ces derniers doivent
obligatoirement être pertinents, placés au bon endroit, et ne pas faire de
répétition avec ce qui existe déjà dans le contenu.

TERMES À INTÉGRER (par ordre de priorité) :
{terms_block}

CONTENU ORIGINAL :
---
{content}
---

Renvoie UNIQUEMENT le contenu modifié, dans le même format que l'original.
Ne mets pas de balises ```html ni de préface.\
"""


@dataclass
class RewriteRequest:
    content: str
    terms: list[dict]   # [{query, count_exact, count_semi}, ...]


@dataclass
class RewriteResult:
    rewritten: str
    cleaned_input: str  # the sanitised HTML that was actually sent to Claude
    cost: float
    input_tokens: int
    output_tokens: int


def _format_terms(terms: list[dict]) -> str:
    lines = []
    for t in terms:
        q = t.get("query", "").strip()
        if not q:
            continue
        ce = int(t.get("count_exact", 0))
        cs = int(t.get("count_semi", 0))
        status = "ABSENT" if ce + cs == 0 else f"présent {ce}× exact + {cs}× semi"
        lines.append(f"- « {q} » ({status})")
    return "\n".join(lines) if lines else "(aucun terme)"


async def rewrite(req: RewriteRequest) -> RewriteResult:
    # Sanitise the user's HTML BEFORE composing the prompt. CMS / Word /
    # Google Docs paste come loaded with class/style/id/Mso* / <span> /
    # <font> noise that wastes Claude's attention budget AND tempts the
    # model to "tidy up" beyond just integrating keywords. After
    # sanitisation we have a deterministic skeleton (h1-h6, p, a[href],
    # tables, lists, strong/em, blockquote) — Claude focuses on the
    # editorial work.
    clean_content = sanitize_html(req.content)

    user = USER_TEMPLATE.format(
        terms_block=_format_terms(req.terms),
        content=clean_content,
    )
    # Sonnet for quality. The integration task is editorial — Haiku would
    # over-rewrite and break the "don't touch the structure" constraint.
    resp = await llm.complete(
        system=SYSTEM,
        user=user,
        max_tokens=8000,
        model=llm.SONNET,
        temperature=0.3,
    )
    # Re-sanitise Claude's output too — it occasionally wraps things in
    # cosmetic <span> or adds a class. Idempotent, cheap, guarantees the
    # final HTML matches the same clean skeleton the user got via /clean.
    cleaned_output = sanitize_html(_strip_code_fences(resp.text))
    return RewriteResult(
        rewritten=cleaned_output,
        cleaned_input=clean_content,
        cost=resp.cost,
        input_tokens=resp.input_tokens,
        output_tokens=resp.output_tokens,
    )


def _strip_code_fences(text: str) -> str:
    """Some Claude responses still wrap in ```html ...```. Strip if present."""
    s = text.strip()
    if s.startswith("```"):
        # Remove the opening fence (with optional language tag)
        first_nl = s.find("\n")
        if first_nl > 0:
            s = s[first_nl + 1:]
    if s.endswith("```"):
        s = s[: -3].rstrip()
    return s.strip()
