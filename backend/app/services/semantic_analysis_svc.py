"""Standalone semantic analysis pipeline.

Result is exposed as an editable workspace for the user to compose
their own copy against the targets.

Concurrency model: a single SemanticAnalysis row should never be processed by
two concurrent invocations of `run()`. We enforce this via a row-level lock
+ status guard. If a previous invocation died (Vercel timeout, OOM) and left
the row stuck in "running", we recover it after 5 minutes of inactivity.

Pipeline (one short async run, ~25-60s — faster than the previous Firecrawl
stack since DataForSEO returns parsed content directly):
  1. fetch_serp + fetch_related (DataForSEO SERP + Labs, parallel)
  2. onpage_parser.parse_urls top-7 (DataForSEO On-Page Content Parsing —
     returns pre-structured H1/H2/H3 + clean markdown; replaces the previous
     Firecrawl + Jina + BS4 + markdown-cleanup stack)
  3. term_freq.compute_term_targets → top 40 BM25-weighted terms (kept; runs
     on the cleaner markdown DataForSEO returns, no more boilerplate noise)
  4. analysis.semantic_report → entities + subthemes + gaps (one Claude call)
  5. persist everything on the SemanticAnalysis row
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.db import SessionLocal
from app.models import SemanticAnalysis
from app.services import analysis as analysis_svc
from app.services import logger as syslog
from app.services import onpage_parser, serp, term_freq


MIN_COMPETITORS_OK = 3


async def run(analysis_id: UUID) -> None:
    """Run the full pipeline for one SemanticAnalysis row. Updates status
    in place: queued → running → done | failed. Idempotent (re-running on a
    'done' row is allowed and refreshes the data)."""
    # Guard against concurrent invocations: when the listing-page fire-and-
    # forget /run + the detail-page self-heal /run both reach the server
    # within a few milliseconds of each other, both used to enter the full
    # pipeline (double SERP fetch, double Claude call, double cost). Now we
    # take a row-level lock and bail out if another invocation already
    # flipped the status to "running".
    async with SessionLocal() as session:
        sa = await session.get(
            SemanticAnalysis, analysis_id, with_for_update=True,
        )
        if sa is None:
            return
        if sa.status == "running":
            # Another invocation owns this row — UNLESS it's stuck. A row
            # whose updated_at is more than 5 min in the past was almost
            # certainly killed by a serverless timeout / OOM and left
            # stuck. Allow this invocation to take over.
            try:
                age = datetime.now(timezone.utc) - sa.updated_at
                if age < timedelta(minutes=5):
                    return
            except Exception:
                # If we can't compute the age, default to "don't run twice"
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

        # 2. Parse via DataForSEO On-Page Content Parsing.
        # Returns structured H1/H2/H3 + clean markdown in one call per URL,
        # no scraping fallback or quality gate needed — DataForSEO handles
        # bot blocks, JS shells and paywalls on their end.
        batch = await onpage_parser.parse_urls(urls, min_success=MIN_COMPETITORS_OK)
        cost += batch.cost
        if len(batch.pages) < MIN_COMPETITORS_OK:
            details = ", ".join(f"{f['url']} ({f['error']})" for f in batch.failed[:3])
            raise RuntimeError(
                f"content-parsing : {len(batch.pages)}/{len(urls)} pages OK. {details}"
            )

        # 3. Collect texts/headings for term frequency analysis.
        parsed_rows: list[tuple[onpage_parser.ParsedDoc, dict]] = []
        for p in batch.pages:
            parsed_rows.append((
                p,
                {
                    "url": p.url,
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
                    "source": p.source,
                },
            ))

        # DataForSEO's `page_as_markdown` is already stripped of boilerplate
        # (nav, footer, sidebars). Feed it straight to BM25.
        competitor_texts = [p.markdown for p in batch.pages]
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
        # Best-effort: if Claude fails or times out, we still ship the BM25
        # targets, which is the actionable data the editor needs.
        common_subthemes: list[str] = []
        rare_subthemes: list[str] = []
        entities: list[str] = []
        content_gaps: list[str] = []
        try:
            report = await analysis_svc.semantic_report(
                keyword=keyword,
                intent="informational",
                parsed=[(p, 0.0) for p, _ in parsed_rows],
                related=[r.keyword for r in related] if related else [],
            )
            cost += report.llm_cost
            common_subthemes = list(report.common_subthemes)
            rare_subthemes = list(report.rare_subthemes)
            entities = list(report.entities)
            content_gaps = list(report.content_gaps)
        except Exception as exc:  # noqa: BLE001
            await syslog.error(
                f"semantic-analysis Claude step failed (non-fatal): {exc}",
                module="semantic_analysis_svc",
                analysis_id=str(analysis_id),
                error=str(exc),
            )

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
            row.common_subthemes = common_subthemes
            row.rare_subthemes = rare_subthemes
            row.entities = entities
            row.content_gaps = content_gaps
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
