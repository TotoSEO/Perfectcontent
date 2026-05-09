"""GSC opportunity optimiser endpoints.

  POST /srv/optimize/parse-csv  → list of opportunities + per-keyword
                                  occurrence counts in the supplied content
  POST /srv/optimize/recount    → re-count occurrences (no LLM, instant)
  POST /srv/optimize/rewrite    → Claude rewrite with strict-integration
                                  prompt
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import require_session
from app.schemas.optimize import ParseCsvIn, RewriteIn
from app.services import gsc_csv, keyword_opportunity, optimize_rewriter

router = APIRouter(dependencies=[Depends(require_session)])


@router.post("/parse-csv")
async def parse_csv(payload: ParseCsvIn) -> dict:
    rows = gsc_csv.parse_gsc_csv(payload.csv_text.encode("utf-8"))
    if not rows:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Le CSV n'a pas pu être lu. Vérifie qu'il contient au moins les "
            "colonnes Query / Impressions et qu'il est exporté depuis Google "
            "Search Console (filtré sur une seule page).",
        )

    opportunities = keyword_opportunity.select_opportunities(
        rows, payload.content,
    )
    return {
        "total_rows": len(rows),
        "opportunities": [k.to_dict() for k in opportunities],
        # Echo the full ranked list (capped at 50) so the user can manually
        # add a query that wasn't auto-selected.
        "all_queries": [
            {
                "query": r.query,
                "clicks": r.clicks,
                "impressions": r.impressions,
                "ctr": round(r.ctr, 4),
                "position": round(r.position, 1),
            }
            for r in rows[:50]
        ],
    }


@router.post("/recount")
async def recount(payload: ParseCsvIn) -> dict:
    """Recompute the per-keyword occurrences in the (changed) content
    without re-parsing the CSV. Used by the live counter on the frontend
    when the user pastes new content."""
    rows = gsc_csv.parse_gsc_csv(payload.csv_text.encode("utf-8"))
    if not rows:
        return {"opportunities": []}
    opportunities = keyword_opportunity.select_opportunities(
        rows, payload.content,
    )
    return {"opportunities": [k.to_dict() for k in opportunities]}


@router.post("/rewrite")
async def rewrite(payload: RewriteIn) -> dict:
    req = optimize_rewriter.RewriteRequest(
        content=payload.content,
        terms=[t.model_dump() for t in payload.terms],
    )
    result = await optimize_rewriter.rewrite(req)
    return {
        "rewritten": result.rewritten,
        "cost": result.cost,
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
    }
