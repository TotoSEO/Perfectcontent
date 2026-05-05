"""Anthropic Claude wrapper. Returns text + cost estimate per call."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from anthropic import AsyncAnthropic

from app.config import get_settings

# claude-sonnet pricing approx (USD per 1M tokens). Update if Anthropic changes.
SONNET_INPUT_PER_M = 3.00
SONNET_OUTPUT_PER_M = 15.00
DEFAULT_MODEL = "claude-sonnet-4-6"


@dataclass
class LLMResponse:
    text: str
    cost: float
    input_tokens: int
    output_tokens: int


_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=get_settings().anthropic_api_key)
    return _client


async def complete(
    *,
    system: str,
    user: str,
    max_tokens: int = 4000,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.4,
) -> LLMResponse:
    if get_settings().mock_external:
        return _mock_response(system, user)

    client = _get_client()
    msg = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text_blocks = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    text = "".join(text_blocks)
    in_t = msg.usage.input_tokens
    out_t = msg.usage.output_tokens
    cost = round(
        in_t / 1_000_000 * SONNET_INPUT_PER_M + out_t / 1_000_000 * SONNET_OUTPUT_PER_M, 6
    )
    return LLMResponse(text=text, cost=cost, input_tokens=in_t, output_tokens=out_t)


def extract_json(text: str) -> dict:
    """Extract the first JSON object/array from a Claude response.

    Handles three cases:
    1. Clean JSON wrapped in a ```json ... ``` fence
    2. JSON inline in the response (the most common case for our prompts)
    3. JSON that got truncated by max_tokens — we try to repair it by
       balancing the open braces/brackets with closes.
    """
    fence = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, flags=re.DOTALL)
    if fence:
        return json.loads(fence.group(1))
    candidate, was_complete = _find_first_json(text)
    if was_complete:
        return json.loads(candidate)
    # Truncated: try to repair by closing remaining open structures
    repaired = _repair_truncated_json(candidate)
    return json.loads(repaired)


def _find_first_json(text: str) -> tuple[str, bool]:
    """Return (substring, complete?). complete=False means we hit the end of
    the text mid-structure — caller should try to repair it."""
    depth = 0
    start = -1
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if start == -1 and ch in "{[":
            start = i
            depth = 1
            continue
        if start == -1:
            continue
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1], True
    if start == -1:
        raise ValueError("no JSON found in LLM response")
    # Reached EOF mid-structure
    return text[start:], False


def _repair_truncated_json(snippet: str) -> str:
    """Best-effort repair of a JSON snippet that got cut mid-stream.

    Trims back to the last complete value (string / number / closing bracket)
    and balances the opening { [ with the right number of closes."""
    # 1. Strip trailing whitespace + a trailing comma if present
    s = snippet.rstrip()
    # 2. If we're inside a string, terminate it (heuristic: closing quote)
    in_string = False
    escape = False
    last_safe = 0
    stack: list[str] = []
    for i, ch in enumerate(s):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack and stack[-1] == ch:
                stack.pop()
        if not in_string and ch in '}]"0123456789truefalsenul':
            last_safe = i + 1
    # If we ended inside a string, cut back to the last safe position
    if in_string:
        s = s[:last_safe]
    # Drop any trailing comma we might leave behind
    s = s.rstrip().rstrip(",").rstrip()
    # Close remaining open structures
    return s + "".join(reversed(stack))


def _mock_response(system: str, user: str) -> LLMResponse:
    """Return canned JSON depending on what role the prompt is playing."""
    sys_low = system.lower()
    if "rapport" in sys_low or "semantic" in sys_low:
        body = json.dumps({
            "common_subthemes": ["définition", "avantages", "comparaison"],
            "rare_subthemes": ["études de cas", "calculateur"],
            "entities": ["Marque A", "Norme NF"],
            "required_terms": ["caractéristiques", "prix", "comparatif"],
            "content_gaps": ["aucun concurrent ne propose un calculateur"],
            "structural_signals": {
                "has_table": True,
                "has_faq": False,
                "avg_words": 1500,
                "recommended_h2_count": 6,
            },
        })
    elif "blueprint" in sys_low or "plan" in sys_low:
        body = json.dumps({
            "title_target": "Titre proposé",
            "angle": "Angle différenciant axé pratique",
            "target_words": 1700,
            "sections": [
                {"id": "intro", "h2": "Introduction", "bullets": ["accroche", "promesse"]},
                {"id": "s1", "h2": "Comprendre les bases", "bullets": ["définition", "principes"]},
                {"id": "s2", "h2": "Comparatif", "bullets": ["tableau"], "element": "table"},
                {"id": "faq", "h2": "FAQ", "bullets": ["q1", "q2", "q3"], "element": "faq"},
            ],
            "schema_recommendations": ["Article", "FAQPage"],
        })
    elif "rédige" in sys_low or "writer" in sys_low or "generate" in sys_low:
        body = json.dumps({
            "title_variants": [
                {"title": "Titre v1", "meta": "Méta v1 — claire et concise."},
                {"title": "Titre v2", "meta": "Méta v2 — orientée bénéfice."},
                {"title": "Titre v3", "meta": "Méta v3 — orientée action."},
            ],
            "html": (
                "<h1>Titre v1</h1>"
                "<p>Introduction du sujet, claire et utile.</p>"
                "<h2>Comprendre les bases</h2><p>Texte clair.</p>"
                "<h2 id=\"comparatif\">Comparatif</h2><p>Texte comparatif.</p>"
                "<h2>FAQ</h2><h3>Question 1</h3><p>Réponse 1.</p>"
            ),
            "schema_recommendations": {"types": ["Article", "FAQPage"]},
            "image_prompt": "Photo éditoriale, lumière douce, sujet centré.",
        })
    elif "ancre" in sys_low or "linking" in sys_low:
        body = json.dumps({
            "links": [
                {"section_id": "s1", "anchor": "guide complet", "target_url": "MOCK_URL"}
            ]
        })
    elif "réécrire" in sys_low or "rewrite" in sys_low or "réécris" in sys_low or "section" in sys_low:
        body = (
            '<h2 id="regen">Section réécrite</h2>'
            "<p>Nouveau paragraphe plus précis et sans redondance avec les autres sections.</p>"
            "<p>Détail complémentaire utile au lecteur.</p>"
        )
    else:
        body = "{}"
    return LLMResponse(text=body, cost=0.0, input_tokens=0, output_tokens=0)
