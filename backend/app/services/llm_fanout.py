"""DataForSEO AI Optimization — LLM Responses (Query Fan-Out).

Queries one or several LLMs (ChatGPT / Claude / Gemini / Perplexity) via the
DataForSEO LLM Responses live endpoints, with `web_search: true` so the model
returns its `fan_out_queries` (the related search queries it would have run)
and `annotations` (the cited source URLs).

Pricing (DataForSEO Live mode, May 2026):
    $0.0006 base + LLM provider cost (returned in `money_spent`).

Cached 7 days per (keyword, model, country) tuple — fan-out queries shift slowly.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx

from app import cache
from app.config import get_settings

BASE = "https://api.dataforseo.com/v3/ai_optimization"

# Mapping: short model id (sidebar UI) -> (endpoint path, default model_name)
SUPPORTED_MODELS: dict[str, tuple[str, str | None]] = {
    "chat_gpt": ("chat_gpt", "gpt-4.1-mini"),
    "claude": ("claude", None),       # let DataForSEO pick the latest
    "gemini": ("gemini", None),
    "perplexity": ("perplexity", None),
}

BASE_COST_PER_CALL = 0.0006  # DataForSEO base; LLM cost added from `money_spent`
TTL = 60 * 60 * 24 * 7       # 7 days


@dataclass
class Annotation:
    title: str | None
    url: str | None
    source_model: str


@dataclass
class ModelResponse:
    model: str
    response_text: str
    fan_out_queries: list[str] = field(default_factory=list)
    annotations: list[Annotation] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    money_spent: float = 0.0
    cost: float = 0.0
    error: str | None = None


@dataclass
class FanoutResult:
    keyword: str
    country_iso: str | None
    responses: list[ModelResponse]
    total_cost: float


def _auth() -> tuple[str, str]:
    s = get_settings()
    return s.dataforseo_login, s.dataforseo_password


async def run_fanout(
    keyword: str,
    models: list[str],
    country_iso: str | None = "FR",
) -> FanoutResult:
    """Call every requested model in parallel. Errors on one model don't
    fail the others — the failed entry is included with an `error` field."""
    valid = [m for m in models if m in SUPPORTED_MODELS]
    if not valid:
        raise ValueError(f"no supported model in {models}; supported: {list(SUPPORTED_MODELS)}")

    tasks = [_call_one(keyword, m, country_iso) for m in valid]
    raw = await asyncio.gather(*tasks, return_exceptions=True)

    responses: list[ModelResponse] = []
    for m, r in zip(valid, raw):
        if isinstance(r, BaseException):
            responses.append(ModelResponse(
                model=m, response_text="", error=f"{type(r).__name__}: {r}",
            ))
        else:
            responses.append(r)
    return FanoutResult(
        keyword=keyword,
        country_iso=country_iso,
        responses=responses,
        total_cost=round(sum(r.cost for r in responses), 6),
    )


async def _call_one(keyword: str, model_id: str, country_iso: str | None) -> ModelResponse:
    endpoint_slug, default_model_name = SUPPORTED_MODELS[model_id]
    cache_k = cache.cache_key("llm_fanout", endpoint_slug, default_model_name or "auto", keyword, country_iso or "")
    hit = await cache.get(cache_k)
    if hit is not None:
        # Stored as raw response payload — reparse so format stays single-source.
        try:
            return _parse(model_id, hit, cached=True)
        except Exception:
            pass  # fall through to live call if cache shape changed

    if get_settings().mock_external:
        payload = _mock_payload(keyword, model_id)
    else:
        url = f"{BASE}/{endpoint_slug}/llm_responses/live"
        body: dict[str, Any] = {
            "user_prompt": keyword[:500],
            "web_search": True,
        }
        if country_iso:
            body["web_search_country_iso_code"] = country_iso
        if default_model_name:
            body["model_name"] = default_model_name
        # Perplexity doesn't accept some optional fields; the others ignore unknowns.

        async with httpx.AsyncClient(timeout=130, auth=_auth()) as client:
            resp = await client.post(url, json=[body])
            resp.raise_for_status()
            payload = resp.json()

    parsed = _parse(model_id, payload, cached=False)
    await cache.set(cache_k, payload, ttl_seconds=TTL, cost_usd=parsed.cost)
    return parsed


def _parse(model_id: str, payload: dict, *, cached: bool) -> ModelResponse:
    tasks = payload.get("tasks") or []
    if not tasks:
        return ModelResponse(model=model_id, response_text="", error="empty tasks[]")
    task = tasks[0]
    if task.get("status_code") and task["status_code"] >= 40000:
        return ModelResponse(
            model=model_id,
            response_text="",
            error=f"DFS {task['status_code']}: {task.get('status_message', '')[:200]}",
        )
    results = task.get("result") or []
    if not results:
        return ModelResponse(model=model_id, response_text="", error="empty result[]")
    r = results[0]

    fan_out = [q for q in (r.get("fan_out_queries") or []) if isinstance(q, str) and q.strip()]

    # Walk message.sections to assemble the text + collect annotations.
    text_parts: list[str] = []
    annotations: list[Annotation] = []
    for item in r.get("items") or []:
        msg = item.get("message") or {}
        for sec in msg.get("sections") or []:
            if sec.get("type") == "text" and sec.get("text"):
                text_parts.append(sec["text"])
            for ann in sec.get("annotations") or []:
                annotations.append(Annotation(
                    title=ann.get("title"),
                    url=ann.get("url"),
                    source_model=model_id,
                ))

    money_spent = float(r.get("money_spent") or 0)
    # When served from cache we don't recharge — return base of 0.
    cost = 0.0 if cached else round(BASE_COST_PER_CALL + money_spent, 6)

    return ModelResponse(
        model=model_id,
        response_text="\n\n".join(text_parts).strip(),
        fan_out_queries=fan_out,
        annotations=annotations,
        input_tokens=int(r.get("input_tokens") or 0),
        output_tokens=int(r.get("output_tokens") or 0),
        money_spent=money_spent,
        cost=cost,
    )


def aggregate_unique_queries(responses: list[ModelResponse]) -> list[dict[str, Any]]:
    """Dedup fan-out queries across models. Returns a list of
    {query, models: [...]} entries, ordered by # of models that surfaced it
    (a query mentioned by 3 LLMs is more valuable than one mentioned by 1)."""
    bucket: dict[str, set[str]] = {}
    for r in responses:
        for q in r.fan_out_queries:
            key = q.strip().lower()
            if not key:
                continue
            bucket.setdefault(key, set()).add(r.model)
    return sorted(
        [
            {"query": k, "models": sorted(v), "model_count": len(v)}
            for k, v in bucket.items()
        ],
        key=lambda x: (-x["model_count"], x["query"]),
    )


def aggregate_citations(responses: list[ModelResponse]) -> list[dict[str, Any]]:
    """Dedup cited URLs. Returns {url, title, models: [...]} entries."""
    bucket: dict[str, dict[str, Any]] = {}
    for r in responses:
        for a in r.annotations:
            if not a.url:
                continue
            slot = bucket.setdefault(a.url, {"url": a.url, "title": a.title, "models": set()})
            slot["models"].add(r.model)
            if a.title and not slot["title"]:
                slot["title"] = a.title
    out = [
        {"url": v["url"], "title": v["title"], "models": sorted(v["models"]), "model_count": len(v["models"])}
        for v in bucket.values()
    ]
    out.sort(key=lambda x: (-x["model_count"], x["url"]))
    return out


def to_dict(res: FanoutResult) -> dict[str, Any]:
    return {
        "keyword": res.keyword,
        "country_iso": res.country_iso,
        "total_cost": res.total_cost,
        "responses": [
            {
                "model": r.model,
                "response_text": r.response_text,
                "fan_out_queries": r.fan_out_queries,
                "annotations": [a.__dict__ for a in r.annotations],
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "money_spent": r.money_spent,
                "cost": r.cost,
                "error": r.error,
            }
            for r in res.responses
        ],
        "unique_queries": aggregate_unique_queries(res.responses),
        "citations": aggregate_citations(res.responses),
    }


# ---- mocks for offline / mock_external=1 testing -----------------------------

def _mock_payload(keyword: str, model_id: str) -> dict:
    """Mirror DataForSEO's live response shape so the parser doesn't branch."""
    return {
        "tasks": [{
            "status_code": 20000,
            "result": [{
                "fan_out_queries": [
                    f"meilleur {keyword}",
                    f"{keyword} prix",
                    f"comment choisir {keyword}",
                    f"avis {keyword}",
                    f"{keyword} 2026",
                ],
                "items": [{
                    "message": {
                        "sections": [{
                            "type": "text",
                            "text": f"Réponse simulée pour « {keyword} » via {model_id}.",
                            "annotations": [
                                {"title": "example.com", "url": "https://example.com/guide"},
                                {"title": "wikipedia.org", "url": f"https://fr.wikipedia.org/wiki/{keyword.replace(' ', '_')}"},
                            ],
                        }],
                    },
                }],
                "input_tokens": 32,
                "output_tokens": 280,
                "money_spent": 0.001,
            }],
        }]
    }
