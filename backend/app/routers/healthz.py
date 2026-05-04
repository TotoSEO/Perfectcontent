"""Smoke endpoints that exercise the pipeline without touching real APIs.

Useful as a CI check and for manual verification right after deploy.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.services import (
    analysis,
    blueprint as blueprint_svc,
    cost,
    embeddings,
    generator,
    intent as intent_svc,
    parser,
    quality,
    serp,
)

router = APIRouter()


@router.get("")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/pipeline")
async def pipeline_smoke() -> dict:
    """Run the deterministic mocked pipeline end-to-end and report.

    Forces MOCK_EXTERNAL=True for this single invocation so the call is free
    and offline. Returns a summary so a human or CI can eyeball it.
    """
    settings = get_settings()
    original_mock = settings.mock_external
    settings.mock_external = True
    try:
        keyword = "smoke test"
        serp_result, related = await serp.fetch_serp_and_related(keyword, 2250, "fr")
        parsed = []
        for o in serp_result.organic_top7:
            p = parser.parse_page(o["url"], None, f"# {o['title']}\n\n{o['description']}\n")
            parsed.append((p, quality.score_competitor(p)))

        intent = intent_svc.classify_intent(serp_result.features, [o["title"] for o in serp_result.organic_top7])

        report = await analysis.semantic_report(
            keyword=keyword,
            intent=intent,
            parsed=parsed,
            related=[r.keyword for r in related],
        )
        bp = await blueprint_svc.build_blueprint(
            keyword=keyword, intent=intent, content_type="blog", report=report
        )
        gen = await generator.generate_content(
            keyword=keyword,
            intent=intent,
            content_type="blog",
            domain=None,
            blueprint=bp.to_dict(),
            required_terms=report.required_terms,
            entities=report.entities,
            content_gaps=report.content_gaps,
        )
        emb = await embeddings.embed(["a", "b"])
        rng = cost.estimate(content_type="blog", internal_linking=False)
    finally:
        settings.mock_external = original_mock

    return {
        "status": "ok",
        "competitors_parsed": len(parsed),
        "intent": intent,
        "report_required_terms": len(report.required_terms),
        "blueprint_sections": len(bp.sections),
        "generated_title_variants": len(gen.title_variants),
        "html_length": len(gen.html),
        "embeddings_dim": len(emb[0]) if emb else 0,
        "cost_estimate_low": rng.low,
        "cost_estimate_high": rng.high,
    }
