"""DataForSEO: SERP organic top + Related Keywords. Cached 24h."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from app import cache
from app.config import get_settings

SERP_LIVE_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"
# Related keywords moved under DataForSEO Labs.
RELATED_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live"
TTL = 60 * 60 * 24

# DataForSEO charges per task; values reflect realistic costs for cap accounting
SERP_COST = 0.0125
RELATED_COST = 0.0035


@dataclass
class SerpResult:
    keyword: str
    organic_top7: list[dict[str, Any]]
    paa: list[str]
    features: list[str]
    raw: dict[str, Any]
    cost: float


@dataclass
class RelatedKw:
    keyword: str
    search_volume: int | None
    cpc: float | None


def _auth() -> tuple[str, str]:
    s = get_settings()
    return s.dataforseo_login, s.dataforseo_password


async def fetch_serp(keyword: str, location_code: int, language_code: str) -> SerpResult:
    key = cache.cache_key("serp", keyword, location_code, language_code)
    hit = await cache.get(key)
    if hit is not None:
        return SerpResult(**hit, cost=0.0)

    if get_settings().mock_external:
        result = _mock_serp(keyword)
    else:
        async with httpx.AsyncClient(timeout=30, auth=_auth()) as client:
            resp = await client.post(
                SERP_LIVE_URL,
                json=[{
                    "keyword": keyword,
                    "location_code": location_code,
                    "language_code": language_code,
                    "depth": 10,
                }],
            )
            resp.raise_for_status()
            payload = resp.json()
        result = _parse_serp(keyword, payload)

    await cache.set(key, _to_dict(result), ttl_seconds=TTL, cost_usd=SERP_COST)
    result.cost = SERP_COST
    return result


async def fetch_related(keyword: str, location_code: int, language_code: str) -> list[RelatedKw]:
    key = cache.cache_key("related", keyword, location_code, language_code)
    hit = await cache.get(key)
    if hit is not None:
        return [RelatedKw(**rk) for rk in hit]

    if get_settings().mock_external:
        items = _mock_related(keyword)
    else:
        try:
            async with httpx.AsyncClient(timeout=30, auth=_auth()) as client:
                resp = await client.post(
                    RELATED_URL,
                    json=[{
                        "keyword": keyword,
                        "location_code": location_code,
                        "language_code": language_code,
                        "limit": 50,
                    }],
                )
                resp.raise_for_status()
                payload = resp.json()
            items = _parse_related(payload)
        except (httpx.HTTPError, KeyError, ValueError):
            # Related keywords endpoint may not be enabled on this account
            # (DataForSEO Labs is a separate subscription tier). Don't fail
            # the whole pipeline — proceed with no related kws.
            items = []

    await cache.set(key, [rk.__dict__ for rk in items], ttl_seconds=TTL, cost_usd=RELATED_COST if items else 0)
    return items


async def fetch_serp_and_related(
    keyword: str, location_code: int, language_code: str
) -> tuple[SerpResult, list[RelatedKw]]:
    """SERP must succeed (it drives the rest of the pipeline). Related is
    nice-to-have — if it fails we proceed with an empty list."""
    serp_result, related = await asyncio.gather(
        fetch_serp(keyword, location_code, language_code),
        fetch_related(keyword, location_code, language_code),
        return_exceptions=True,
    )
    if isinstance(serp_result, BaseException):
        raise serp_result
    if isinstance(related, BaseException):
        related = []
    return serp_result, related


def _parse_serp(keyword: str, payload: dict) -> SerpResult:
    tasks = payload.get("tasks", [])
    if not tasks:
        return SerpResult(keyword, [], [], [], payload, SERP_COST)
    items = (tasks[0].get("result") or [{}])[0].get("items", []) or []
    organic = [i for i in items if i.get("type") == "organic"][:7]
    paa = [
        item.get("title", "")
        for item in items
        if item.get("type") == "people_also_ask"
        for _ in [None]
    ]
    features = sorted({i.get("type") for i in items if i.get("type")} - {"organic"})
    return SerpResult(
        keyword=keyword,
        organic_top7=[
            {"url": o.get("url"), "title": o.get("title"), "description": o.get("description")}
            for o in organic
        ],
        paa=paa,
        features=list(features),
        raw=payload,
        cost=SERP_COST,
    )


def _parse_related(payload: dict) -> list[RelatedKw]:
    tasks = payload.get("tasks", [])
    if not tasks:
        return []
    items = (tasks[0].get("result") or [{}])[0].get("items", []) or []
    out: list[RelatedKw] = []
    for it in items:
        kd = it.get("keyword_data") or {}
        kw = kd.get("keyword") or it.get("keyword")
        if not kw:
            continue
        ki = kd.get("keyword_info") or {}
        out.append(
            RelatedKw(
                keyword=kw,
                search_volume=ki.get("search_volume"),
                cpc=ki.get("cpc"),
            )
        )
    return out


def _to_dict(r: SerpResult) -> dict:
    return {
        "keyword": r.keyword,
        "organic_top7": r.organic_top7,
        "paa": r.paa,
        "features": r.features,
        "raw": r.raw,
    }


def _mock_serp(keyword: str) -> SerpResult:
    return SerpResult(
        keyword=keyword,
        organic_top7=[
            {
                "url": f"https://example.com/article-{i}",
                "title": f"{keyword} - guide {i}",
                "description": f"Tout sur {keyword}, partie {i}.",
            }
            for i in range(1, 8)
        ],
        paa=[f"Comment choisir {keyword} ?", f"Quel prix pour {keyword} ?"],
        features=["people_also_ask", "related_searches"],
        raw={},
        cost=SERP_COST,
    )


def _mock_related(keyword: str) -> list[RelatedKw]:
    return [
        RelatedKw(keyword=f"{keyword} pas cher", search_volume=400, cpc=0.4),
        RelatedKw(keyword=f"meilleur {keyword}", search_volume=1100, cpc=0.7),
        RelatedKw(keyword=f"{keyword} avis", search_volume=600, cpc=0.3),
    ]
