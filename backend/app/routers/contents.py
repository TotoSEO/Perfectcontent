from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_session
from app.db import get_db
from app.models import Content, Job, SemanticReport
from app.schemas.content import ContentOut, ContentPatch, RegenerateContentSectionIn
from app.services import image as image_svc
from app.services import regenerate as regen_svc

router = APIRouter(dependencies=[Depends(require_session)])


@router.get("", response_model=list[ContentOut])
async def list_contents(
    folder_id: UUID | None = None, db: AsyncSession = Depends(get_db)
) -> list[Content]:
    stmt = select(Content).order_by(Content.updated_at.desc())
    if folder_id is not None:
        stmt = stmt.where(Content.folder_id == folder_id)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/{content_id}", response_model=ContentOut)
async def get_content(content_id: UUID, db: AsyncSession = Depends(get_db)) -> Content:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    return content


@router.patch("/{content_id}", response_model=ContentOut)
async def patch_content(
    content_id: UUID, payload: ContentPatch, db: AsyncSession = Depends(get_db)
) -> Content:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(content, field, value)
    await db.commit()
    await db.refresh(content)
    return content


@router.post("/{content_id}/generate-image")
async def generate_image_now(
    content_id: UUID,
    backend: str = "auto",
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate the image on-demand. Backend = 'auto' | 'openai' | 'fal'.

    'auto' picks OpenAI if its key is set, else Fal. Cost is added to the
    related job's cost_actual (best effort) and surfaced in the response."""
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    if not content.image_prompt:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no image prompt")
    img = await image_svc.generate_image(content.image_prompt, backend=backend)
    content.image_url = img.url
    await db.commit()
    return {
        "ok": True,
        "image_url": img.url,
        "cost": img.cost,
        "backend": img.backend,
    }


# Legacy alias kept so older frontends don't break
@router.post("/{content_id}/regenerate-image")
async def regenerate_image_alias(
    content_id: UUID, db: AsyncSession = Depends(get_db)
) -> dict:
    return await generate_image_now(content_id, "auto", db)


@router.post("/{content_id}/regenerate-section")
async def regenerate_content_section(
    content_id: UUID,
    payload: RegenerateContentSectionIn,
    db: AsyncSession = Depends(get_db),
) -> dict:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    await regen_svc.regenerate_section(content_id, payload.section_id)
    return {"ok": True}


@router.get("/{content_id}/competitors")
async def competitors_compare(
    content_id: UUID, db: AsyncSession = Depends(get_db)
) -> dict:
    """Comparative table: each top-7 competitor's metrics vs. the user's
    current content. Pulled from the SemanticReport persisted during the
    pipeline's parse step."""
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")

    # Most recent job tied to this content
    job = (
        await db.execute(
            select(Job)
            .where(Job.content_id == content_id)
            .order_by(Job.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if job is None:
        return {"competitors": [], "current": _content_metrics(content)}
    sr = (
        await db.execute(select(SemanticReport).where(SemanticReport.job_id == job.id))
    ).scalar_one_or_none()
    competitors = list(sr.competitors or []) if sr else []
    return {
        "competitors": competitors,
        "current": _content_metrics(content),
    }


def _content_metrics(content: Content) -> dict:
    """Quick metrics extraction from the user's HTML (server-side mirror of
    what the editor knows). Lightweight — no parser dependency."""
    from bs4 import BeautifulSoup
    html = content.html or ""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    return {
        "title": content.chosen_title,
        "word_count": len(text.split()),
        "paragraphs_count": len(soup.find_all("p")),
        "h2_count": len(soup.find_all("h2")),
        "h3_count": len(soup.find_all("h3")),
        "lists_count": len(soup.find_all(["ul", "ol"])),
        "tables_count": len(soup.find_all("table")),
        "coverage_score": float(content.coverage_score) if content.coverage_score is not None else None,
        "internal_links_count": len(content.internal_links or []),
    }


@router.get("/{content_id}/prompts")
async def get_prompts(content_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Return the prompts (system + user) actually sent to the LLM at each step
    of the most recent job tied to this content."""
    job = (
        await db.execute(
            select(Job)
            .where(Job.content_id == content_id)
            .order_by(Job.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if job is None:
        return {"job_id": None, "mode": None, "prompts": {}}
    return {
        "job_id": str(job.id),
        "mode": job.mode,
        "prompts": job.prompts or {},
    }


@router.get("/{content_id}/serp")
async def get_serp_analysis(content_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Return everything we extracted from the SERP for this content:
    - top-7 organic results (urls + titles)
    - per-competitor parsed metrics (word_count, h2[], lists, tables, schema flags…)
    - per-competitor full scraped markdown body
    - per-competitor breakdown (angle / strength / weakness from analysis)
    - People Also Ask
    - SERP-implied format (listicle / how-to / comparator / …) with vote split
    - related keywords (top 30)

    Lets the user verify the scraping/analysis quality + see what Claude
    actually saw before generating the article."""
    job = (
        await db.execute(
            select(Job)
            .where(Job.content_id == content_id)
            .order_by(Job.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if job is None:
        return {"job_id": None, "competitors": [], "paa": [], "format": None, "related": []}
    sr = (
        await db.execute(
            select(SemanticReport).where(SemanticReport.job_id == job.id)
        )
    ).scalar_one_or_none()
    if sr is None:
        return {"job_id": str(job.id), "competitors": [], "paa": [], "format": None, "related": []}

    serp_raw = sr.serp_raw or {}
    organic = serp_raw.get("organic_top7", []) or []
    scraped = serp_raw.get("scraped", []) or []
    paa_raw = serp_raw.get("paa", []) or []
    fmt_payload = serp_raw.get("serp_format") or {}

    # Index scraped pages by URL for quick lookup
    scraped_by_url = {p.get("url"): p for p in scraped if isinstance(p, dict)}

    # Index competitor breakdown by rank (1-based)
    breakdown = list(sr.competitors_breakdown or [])
    bd_by_rank = {b.get("rank"): b for b in breakdown if isinstance(b, dict)}

    # Build per-competitor payload by zipping organic_top7 + parsed competitors + scraped + breakdown
    parsed = list(sr.competitors or [])
    competitors_out = []
    for i, parsed_row in enumerate(parsed):
        url = parsed_row.get("url") if isinstance(parsed_row, dict) else None
        scrape = scraped_by_url.get(url, {}) if url else {}
        bd = bd_by_rank.get(i + 1, {})
        competitors_out.append({
            "rank": i + 1,
            "url": url,
            "title": parsed_row.get("title") if isinstance(parsed_row, dict) else None,
            "h1": parsed_row.get("h1"),
            "h2": parsed_row.get("h2") or [],
            "h3_count": parsed_row.get("h3_count"),
            "word_count": parsed_row.get("word_count"),
            "paragraphs_count": parsed_row.get("paragraphs_count"),
            "lists_count": parsed_row.get("lists_count"),
            "tables_count": parsed_row.get("tables_count"),
            "images_with_alt": parsed_row.get("images_with_alt"),
            "images_without_alt": parsed_row.get("images_without_alt"),
            "has_faq_schema": parsed_row.get("has_faq_schema"),
            "has_article_schema": parsed_row.get("has_article_schema"),
            "has_product_schema": parsed_row.get("has_product_schema"),
            "author": parsed_row.get("author"),
            "quality": parsed_row.get("quality"),
            "scrape_source": scrape.get("source"),  # firecrawl | jina | cache
            "scrape_error": scrape.get("error"),
            "markdown": scrape.get("markdown") or "",
            "angle": bd.get("angle"),
            "strength": bd.get("strength"),
            "weakness": bd.get("weakness"),
        })

    # Normalize PAA to a list of strings
    paa: list[str] = []
    for item in paa_raw:
        if isinstance(item, str):
            paa.append(item)
        elif isinstance(item, dict):
            q = item.get("question") or item.get("title") or item.get("query")
            if isinstance(q, str):
                paa.append(q)

    # Related keywords as flat list
    rel_raw = list(sr.related_keywords or [])
    related = []
    for r in rel_raw[:30]:
        if isinstance(r, str):
            related.append(r)
        elif isinstance(r, dict):
            related.append(r.get("keyword") or "")

    return {
        "job_id": str(job.id),
        "keyword": job.keyword,
        "competitors": competitors_out,
        "organic_top7": [
            {"url": o.get("url"), "title": o.get("title"), "description": o.get("description")}
            for o in organic if isinstance(o, dict)
        ],
        "paa": paa,
        "format": {
            "format": fmt_payload.get("format"),
            "votes": fmt_payload.get("votes") or {},
            "brief": fmt_payload.get("brief") or "",
        },
        "related": related,
        "common_subthemes": list(sr.common_subthemes or []),
        "rare_subthemes": list(sr.rare_subthemes or []),
        "entities": list(sr.entities or []),
        "content_gaps": list(sr.content_gaps or []),
    }


@router.get("/{content_id}/semantic-targets")
async def semantic_targets(content_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Return the top corpus terms with target / min / max frequencies.

    The frontend computes the user's actual count locally from the editor HTML
    using the same tokenization rules (mirrored in lib/stopwords.ts).
    """
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")

    # Find the most recent job for this content; its semantic_report has the targets.
    job = (
        await db.execute(
            select(Job)
            .where(Job.content_id == content_id)
            .order_by(Job.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if job is None:
        return {"keyword": content.keyword, "targets": []}

    sr = (
        await db.execute(
            select(SemanticReport).where(SemanticReport.job_id == job.id)
        )
    ).scalar_one_or_none()

    return {
        "keyword": content.keyword,
        "targets": (sr.term_targets if sr and sr.term_targets else []),
    }


@router.get("/{content_id}/export", response_class=PlainTextResponse)
async def export_content(
    content_id: UUID,
    format: str = Query("html", pattern="^(html|md)$"),
    db: AsyncSession = Depends(get_db),
) -> str:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    if format == "md":
        return content.markdown or ""
    return content.html or ""


@router.delete("/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(content_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    content = await db.get(Content, content_id)
    if content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "content not found")
    await db.delete(content)
    await db.commit()
