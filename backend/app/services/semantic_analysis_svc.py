"""Standalone semantic analysis pipeline.

Reuses the same SERP→scrape→parse→BM25 stack as the content generator, but
the result is exposed as an editable workspace for the user to compose
their own copy against the targets.

Pipeline (one short async run, ~40-90s):
  1. fetch_serp + fetch_related (DataForSEO, parallel)
  2. scrape_urls top-7 (Firecrawl/Jina + 72h cache)
  3. parser.parse_page on each (extract metrics + clean text)
  4. term_freq.compute_term_targets → top 40 BM25-weighted terms with
     surface forms, target/min/max counts, importance score
  5. analysis.semantic_report → entities + subthemes + gaps (one Claude
     call, opt-in skip if cost-sensitive)
  6. persist everything on the SemanticAnalysis row
"""
from __future__ import annotations

from uuid import UUID

from app.db import SessionLocal
from app.models import SemanticAnalysis
from app.services import analysis as analysis_svc
from app.services import logger as syslog
from app.services import parser, scraper, serp, term_freq


MIN_COMPETITORS_OK = 4


async def run(analysis_id: UUID) -> None:
    """Run the full pipeline for one SemanticAnalysis row. Updates status
    in place: queued → running → done | failed. Idempotent (re-running on a
    'done' row is allowed and refreshes the data)."""
    async with SessionLocal() as session:
        sa = await session.get(SemanticAnalysis, analysis_id)
        if sa is None:
            return
        sa.status = "running"
        sa.error = None
        await session.commit()
        keyword = sa.keyword
        loc = sa.location_code
        lang = sa.language_code

    cost = 0.0
    try:
        # 1. SERP + related
        serp_result, related = await serp.fetch_serp_and_related(keyword, loc, lang)
        cost += serp_result.cost + (serp.RELATED_COST if related else 0)

        urls = [
            o.get("url") for o in serp_result.organic_top7 if o.get("url")
        ]
        if not urls:
            raise RuntimeError("aucune URL organique remontée par DataForSEO")

        # 2. Scrape
        batch = await scraper.scrape_urls(urls, min_success=MIN_COMPETITORS_OK)
        cost += batch.cost
        if len(batch.pages) < MIN_COMPETITORS_OK:
            details = ", ".join(f"{f['url']} ({f['error']})" for f in batch.failed[:3])
            raise RuntimeError(
                f"scrape : {len(batch.pages)}/{len(urls)} pages OK. {details}"
            )

        # 3. Parse + collect texts/headings
        parsed_rows: list[tuple[parser.ParsedPage, dict]] = []
        for raw in batch.pages:
            p = parser.parse_page(raw.url, raw.html, raw.markdown)
            parsed_rows.append((
                p,
                {
                    "url": raw.url,
                    "title": p.title,
                    "h1": p.h1,
                    "h2": list(p.h2),
                    "h3_count": len(p.h3),
                    "word_count": p.word_count,
                    "paragraphs_count": len(p.paragraphs),
                    "lists_count": p.lists_count,
                    "tables_count": p.tables_count,
                    "has_faq_schema": p.has_faq_schema,
                    "has_article_schema": p.has_article_schema,
                    "has_product_schema": p.has_product_schema,
                    "author": p.author,
                    "source": raw.source,
                },
            ))

        # BM25 ingests the scraped markdown directly — same as the content
        # pipeline does in _step_analyze.
        competitor_texts = [raw.markdown for raw in batch.pages]
        headings_text = " . ".join(
            " ".join(filter(None, [parsed.h1 or ""] + list(parsed.h2)))
            for parsed, _ in parsed_rows
        )

        # 4. Term targets — the heart of the analysis
        targets = term_freq.compute_term_targets(
            competitor_texts,
            keyword=keyword,
            headings_text=headings_text,
            top_n=40,
        )

        # 5. Claude semantic report (entities / subthemes / gaps).
        # Lighter than the full content pipeline call: we don't need
        # required_terms (term_freq already covers that more reliably).
        report = await analysis_svc.semantic_report(
            keyword=keyword,
            intent="informational",
            parsed=[(p, 0.0) for p, _ in parsed_rows],
            related=[r.keyword for r in related] if related else [],
        )
        cost += report.llm_cost

        # 6. Persist
        async with SessionLocal() as session:
            row = await session.get(SemanticAnalysis, analysis_id)
            if row is None:
                return
            row.serp_raw = {
                "keyword": serp_result.keyword,
                "organic_top7": serp_result.organic_top7,
                "paa": serp_result.paa,
                "features": serp_result.features,
                "scraped": [
                    {
                        "url": raw.url,
                        "title": raw.title,
                        "markdown": raw.markdown,
                        "source": raw.source,
                    }
                    for raw in batch.pages
                ],
            }
            row.related_keywords = [r.__dict__ for r in related]
            row.competitors = [meta for _, meta in parsed_rows]
            row.common_subthemes = list(report.common_subthemes)
            row.rare_subthemes = list(report.rare_subthemes)
            row.entities = list(report.entities)
            row.content_gaps = list(report.content_gaps)
            row.term_targets = [t.to_dict() for t in targets]
            row.cost = round(cost, 4)
            row.status = "done"
            row.error = None
            await session.commit()

    except Exception as exc:  # noqa: BLE001
        await syslog.error(
            f"semantic-analysis failed: {exc}",
            module="semantic_analysis_svc",
            analysis_id=str(analysis_id),
            error=str(exc),
        )
        async with SessionLocal() as session:
            row = await session.get(SemanticAnalysis, analysis_id)
            if row is not None:
                row.status = "failed"
                row.error = str(exc)
                row.cost = round(cost, 4)
                await session.commit()
