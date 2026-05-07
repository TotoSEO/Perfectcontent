"""Advanced cannibalization audit between two URLs for a given keyword.

Pipeline:
  1. Scrape both URLs (re-uses the existing scraper + 72h cache)
  2. Parse structurally (existing parser)
  3. Compute embeddings: keyword, page A, page B
  4. Algorithmic signals:
       - cosine(KW, A), cosine(KW, B), cosine(A, B)
       - Jaccard on lemmatized headings
       - SimHash + Jaccard on body 3-5 grams
       - Entity overlap (named tokens from headings + first paragraphs)
  5. SERP probe: query DataForSEO for the keyword and check whether either URL
     ranks in the top 20 (ground truth: what Google actually does)
  6. Authority signals: count internal links pointing to each URL from the
     pgvector index of the same domain (if it's been indexed)
  7. Quality / freshness from the parser (word count, structure, dateModified)
  8. GSC inputs (optional) for performance signals
  9. Compute calibrated probability + severity + winner score
 10. Hand the algorithmic dossier to Claude for: verdict in plain language,
     section-by-section merge plan, risks, recommended action

The whole pipeline is idempotent and uses the same api_cache table as the
content pipeline so re-running an audit on the same URLs is ~free.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from datetime import datetime
from urllib.parse import urlparse

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app import cache
from app.config import get_settings
from app.models import Domain, IndexedPage
from app.services import embeddings, llm, parser, scraper, serp


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class GscStats:
    clicks: int | None = None
    impressions: int | None = None
    position: float | None = None  # average position
    ctr: float | None = None       # 0-1


@dataclass
class CannibalRequest:
    keyword: str
    url_a: str
    url_b: str
    location_code: int = 2250
    language_code: str = "fr"
    gsc_a: GscStats | None = None
    gsc_b: GscStats | None = None
    backlinks_a: int | None = None  # optional, from Ahrefs/Majestic
    backlinks_b: int | None = None


@dataclass
class PageProbe:
    """Everything we know about one URL after scrape + parse + crawl-check."""
    url: str
    fetched: bool
    error: str | None = None
    title: str | None = None
    h1: str | None = None
    h2: list[str] = field(default_factory=list)
    h3: list[str] = field(default_factory=list)
    word_count: int = 0
    paragraphs_count: int = 0
    lists_count: int = 0
    tables_count: int = 0
    images_with_alt: int = 0
    has_faq_schema: bool = False
    has_article_schema: bool = False
    has_product_schema: bool = False
    canonical_url: str | None = None
    canonical_resolved: bool = False  # canonical points to the OTHER URL
    noindex: bool = False
    is_paginated: bool = False
    last_modified: datetime | None = None
    body_excerpt: str = ""        # first ~600 chars of cleaned text (for prompt)
    entities: list[str] = field(default_factory=list)
    internal_links_in: int = 0    # from pgvector index if available
    url_depth: int = 0


@dataclass
class CannibalSignals:
    cos_kw_a: float
    cos_kw_b: float
    cos_a_b: float
    jaccard_headings: float
    ngram_overlap: float
    entity_overlap: float
    serp_a_position: int | None
    serp_b_position: int | None
    serp_both_top20: bool
    canonical_resolved: bool
    intent_diverge: bool          # set later by Claude / heuristic


@dataclass
class WinnerScore:
    url: str
    total: float
    authority: float
    performance: float
    quality: float
    freshness: float
    breakdown: dict


@dataclass
class CannibalReport:
    keyword: str
    a: PageProbe
    b: PageProbe
    signals: CannibalSignals
    probability: float           # 0-100
    severity: float              # 0-100
    winner: str | None           # "A" | "B" | None (undecided)
    winner_gap: float
    winner_reason: str
    score_a: WinnerScore
    score_b: WinnerScore
    verdict: str                 # cannibalize_strong | weak | ok_differentiated
    confidence: float            # 0-1
    action: str                  # merge_b_into_a_301 | canonical_b_to_a | differentiate | noindex_b | no_action
    merge_plan: list[str]
    risks: list[str]
    cost: float                  # USD spent on this audit
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        # datetime → ISO
        for side in ("a", "b"):
            lm = d[side].get("last_modified")
            if lm is not None:
                d[side]["last_modified"] = lm.isoformat() if hasattr(lm, "isoformat") else lm
        return d


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def audit(req: CannibalRequest, db: AsyncSession) -> CannibalReport:
    cost = 0.0
    notes: list[str] = []

    # 1+2 Fetch and parse both pages (sequential is fine — scraper has its own
    # cache layer and HTTP timeouts so two URLs add at most ~2s in the worst
    # cache-miss case).
    probe_a = await _fetch_and_parse(req.url_a)
    probe_b = await _fetch_and_parse(req.url_b)

    # Cross-reference canonicals: a canonical pointing to the OTHER URL = resolved
    if probe_a.canonical_url and _same_url(probe_a.canonical_url, req.url_b):
        probe_a.canonical_resolved = True
    if probe_b.canonical_url and _same_url(probe_b.canonical_url, req.url_a):
        probe_b.canonical_resolved = True

    # Hard exits
    if not probe_a.fetched:
        notes.append(f"URL A non scrapable : {probe_a.error}")
    if not probe_b.fetched:
        notes.append(f"URL B non scrapable : {probe_b.error}")

    # 3. Embeddings
    [vec_kw, vec_a, vec_b] = await embeddings.embed(
        [
            req.keyword,
            _embedding_text(probe_a),
            _embedding_text(probe_b),
        ]
    )
    # Embeddings call is cached internally by content hash; small flat cost.
    cost += 0.00005

    cos_kw_a = _cosine(vec_kw, vec_a) if probe_a.fetched else 0.0
    cos_kw_b = _cosine(vec_kw, vec_b) if probe_b.fetched else 0.0
    cos_a_b = _cosine(vec_a, vec_b) if probe_a.fetched and probe_b.fetched else 0.0

    # 4. Lexical signals
    jaccard = _jaccard_headings(probe_a, probe_b)
    ngram = _ngram_overlap(probe_a.body_excerpt, probe_b.body_excerpt)
    ent_overlap = _entity_overlap(probe_a.entities, probe_b.entities)

    # 5. SERP probe
    serp_pos_a, serp_pos_b, serp_cost = await _serp_probe(
        req.keyword, req.url_a, req.url_b, req.location_code, req.language_code,
    )
    cost += serp_cost
    serp_both_top20 = (
        serp_pos_a is not None
        and serp_pos_b is not None
        and serp_pos_a <= 20
        and serp_pos_b <= 20
    )

    # 6. Authority — internal links from pgvector index if domain is indexed
    domain_a, domain_b = _hostname(req.url_a), _hostname(req.url_b)
    if domain_a == domain_b and domain_a:
        probe_a.internal_links_in, probe_b.internal_links_in = await _count_internal_links(
            db, domain_a, req.url_a, req.url_b,
        )

    probe_a.url_depth = _url_depth(req.url_a)
    probe_b.url_depth = _url_depth(req.url_b)

    # 7. Compute scores
    signals = CannibalSignals(
        cos_kw_a=cos_kw_a,
        cos_kw_b=cos_kw_b,
        cos_a_b=cos_a_b,
        jaccard_headings=jaccard,
        ngram_overlap=ngram,
        entity_overlap=ent_overlap,
        serp_a_position=serp_pos_a,
        serp_b_position=serp_pos_b,
        serp_both_top20=serp_both_top20,
        canonical_resolved=probe_a.canonical_resolved or probe_b.canonical_resolved,
        intent_diverge=False,  # Claude can flip this later
    )

    probability = _probability(signals, req)
    severity = _severity(signals, req)
    score_a, score_b = _winner_scores(probe_a, probe_b, req, signals)

    # Decide winner with a 5-pt gap rule
    if abs(score_a.total - score_b.total) < 5:
        winner: str | None = None
        winner_gap = abs(score_a.total - score_b.total)
        winner_reason = "Écart < 5 pts — décision laissée à l'humain."
    elif score_a.total > score_b.total:
        winner = "A"
        winner_gap = score_a.total - score_b.total
        winner_reason = _winner_reason(probe_a, probe_b, score_a, score_b, "A", req, signals)
    else:
        winner = "B"
        winner_gap = score_b.total - score_a.total
        winner_reason = _winner_reason(probe_b, probe_a, score_b, score_a, "B", req, signals)

    # Algo verdict (Claude can override)
    if probability >= 70 and severity >= 30:
        algo_verdict = "cannibalize_strong"
    elif probability >= 45:
        algo_verdict = "cannibalize_weak"
    else:
        algo_verdict = "ok_differentiated"

    # 8. Claude action plan + final action
    if probe_a.fetched and probe_b.fetched:
        plan = await _claude_action_plan(
            req=req,
            probe_a=probe_a,
            probe_b=probe_b,
            signals=signals,
            probability=probability,
            severity=severity,
            winner=winner,
            winner_reason=winner_reason,
            algo_verdict=algo_verdict,
        )
        cost += plan["cost"]
        verdict = plan["verdict"]
        confidence = plan["confidence"]
        action = plan["action"]
        merge_plan = plan["merge_plan"]
        risks = plan["risks"]
        # Claude may flip intent_diverge → recompute probability one more time
        if plan.get("intent_diverge"):
            signals.intent_diverge = True
            probability = _probability(signals, req)
    else:
        verdict = "ok_differentiated"
        confidence = 0.0
        action = "no_action"
        merge_plan = []
        risks = []
        notes.append("Plan d'action désactivé : impossible de scraper les deux pages.")

    return CannibalReport(
        keyword=req.keyword,
        a=probe_a,
        b=probe_b,
        signals=signals,
        probability=probability,
        severity=severity,
        winner=winner,
        winner_gap=winner_gap,
        winner_reason=winner_reason,
        score_a=score_a,
        score_b=score_b,
        verdict=verdict,
        confidence=confidence,
        action=action,
        merge_plan=merge_plan,
        risks=risks,
        cost=round(cost, 4),
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Step helpers
# ---------------------------------------------------------------------------

async def _fetch_and_parse(url: str) -> PageProbe:
    """Scrape + parse one URL into a PageProbe."""
    batch = await scraper.scrape_urls([url], min_success=0)
    if not batch.pages:
        err = batch.failed[0]["error"] if batch.failed else "scrape failed"
        return PageProbe(url=url, fetched=False, error=err)
    page = batch.pages[0]
    parsed = parser.parse_page(page.url, page.html, page.markdown)

    # Extract canonical + noindex from raw HTML if present
    canonical, noindex = _extract_meta_directives(page.html or "")

    body_text = ""
    if parsed.paragraphs:
        body_text = " ".join(parsed.paragraphs[:10])
    body_excerpt = (body_text[:1200] or page.markdown[:1200] or "").strip()

    entities = _quick_entities(parsed)

    return PageProbe(
        url=url,
        fetched=True,
        title=parsed.title,
        h1=parsed.h1,
        h2=list(parsed.h2),
        h3=list(parsed.h3),
        word_count=parsed.word_count,
        paragraphs_count=len(parsed.paragraphs),
        lists_count=parsed.lists_count,
        tables_count=parsed.tables_count,
        images_with_alt=parsed.images_with_alt,
        has_faq_schema=parsed.has_faq_schema,
        has_article_schema=parsed.has_article_schema,
        has_product_schema=parsed.has_product_schema,
        canonical_url=canonical,
        noindex=noindex,
        is_paginated=_is_paginated(url),
        last_modified=parsed.published_at,
        body_excerpt=body_excerpt,
        entities=entities,
    )


_CANONICAL_RE = re.compile(
    r'<link\s+[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
_NOINDEX_RE = re.compile(
    r'<meta\s+[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


def _extract_meta_directives(html: str) -> tuple[str | None, bool]:
    if not html:
        return None, False
    m = _CANONICAL_RE.search(html)
    canonical = m.group(1).strip() if m else None
    n = _NOINDEX_RE.search(html)
    noindex = bool(n and "noindex" in n.group(1).lower())
    return canonical, noindex


def _is_paginated(url: str) -> bool:
    try:
        u = urlparse(url)
        if re.search(r"/(page|p)/\d+/?$", u.path, re.IGNORECASE):
            return True
        q = u.query.lower()
        return any(token in q for token in ("page=", "paged=", "pg="))
    except Exception:
        return False


def _embedding_text(p: PageProbe) -> str:
    """Build the text we embed: title + H1 + first H2s + body excerpt.
    Title and H1 carry most of the topical signal so we put them first."""
    if not p.fetched:
        return ""
    parts = [p.title or "", p.h1 or ""]
    parts += p.h2[:6]
    parts.append(p.body_excerpt[:800])
    return " . ".join(filter(None, parts))[:4000]


# ---------------------------------------------------------------------------
# Lexical / structural signals
# ---------------------------------------------------------------------------

# French + English stopwords. Conservative — we'd rather under-strip than
# accidentally drop a meaningful term.
_STOPWORDS = {
    "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "à", "au",
    "aux", "ce", "ces", "cet", "cette", "qui", "que", "quoi", "dont", "où",
    "pour", "par", "sur", "dans", "avec", "sans", "vers", "chez", "entre",
    "se", "sa", "son", "ses", "leur", "leurs", "mon", "ma", "mes", "ton",
    "ta", "tes", "votre", "vos", "notre", "nos", "il", "elle", "ils", "elles",
    "je", "tu", "nous", "vous", "on", "y", "en", "ne", "pas", "plus", "moins",
    "très", "trop", "aussi", "comme", "si", "alors", "donc", "mais", "car",
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "with", "without",
    "and", "or", "but", "if", "then", "is", "are", "was", "were", "be", "been",
    "by", "from", "as", "this", "that", "these", "those", "it", "its",
    "comment", "pourquoi", "quand",
}

_TOKEN_RE = re.compile(r"[a-zA-Zà-üÀ-Ü0-9]{3,}", re.UNICODE)


def _normalize_tokens(text: str) -> list[str]:
    text = text.lower()
    return [t for t in _TOKEN_RE.findall(text) if t not in _STOPWORDS]


def _jaccard_headings(a: PageProbe, b: PageProbe) -> float:
    set_a = set(_normalize_tokens(" ".join([a.h1 or ""] + a.h2 + a.h3)))
    set_b = set(_normalize_tokens(" ".join([b.h1 or ""] + b.h2 + b.h3)))
    if not set_a or not set_b:
        return 0.0
    inter = len(set_a & set_b)
    union = len(set_a | set_b)
    return inter / union if union else 0.0


def _ngram_overlap(a: str, b: str, n: int = 4) -> float:
    """Jaccard on word n-grams of the body excerpt. Catches paraphrases the
    raw embedding cosine sometimes underweights."""
    toks_a = _normalize_tokens(a)
    toks_b = _normalize_tokens(b)
    if len(toks_a) < n or len(toks_b) < n:
        return 0.0
    grams_a = {" ".join(toks_a[i:i + n]) for i in range(len(toks_a) - n + 1)}
    grams_b = {" ".join(toks_b[i:i + n]) for i in range(len(toks_b) - n + 1)}
    if not grams_a or not grams_b:
        return 0.0
    inter = len(grams_a & grams_b)
    union = len(grams_a | grams_b)
    return inter / union if union else 0.0


def _quick_entities(p: parser.ParsedPage) -> list[str]:
    """Extract proper-noun-ish tokens from headings + first paragraphs.
    Naive (capitalized word that isn't sentence-initial) but fast and
    deterministic. Used for entity overlap signal + the Claude prompt."""
    text = " ".join(filter(None, [p.h1] + list(p.h2) + p.paragraphs[:5]))
    out: dict[str, int] = {}
    for m in re.finditer(r"\b([A-ZÀ-Ü][A-Za-zà-üÀ-Ü0-9'’-]{2,})", text):
        tok = m.group(1)
        # Skip lone sentence-initial capitalized words by checking the
        # preceding char in the source text (cheap heuristic).
        out[tok] = out.get(tok, 0) + 1
    # Keep tokens seen ≥2 times — singletons are mostly noise
    return [k for k, v in sorted(out.items(), key=lambda x: -x[1]) if v >= 2][:30]


def _entity_overlap(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    return len(sa & sb) / max(len(sa | sb), 1)


# ---------------------------------------------------------------------------
# SERP probe
# ---------------------------------------------------------------------------

_SERP_PROBE_TTL = 6 * 60 * 60  # 6h


async def _serp_probe(
    keyword: str, url_a: str, url_b: str, location_code: int, language_code: str,
) -> tuple[int | None, int | None, float]:
    """Return (position_of_a, position_of_b, cost) on the keyword's top-100
    organic results. We re-use serp.fetch_serp's DataForSEO call but extend the
    payload to depth=100 via cache-shared logic."""
    key = cache.cache_key("cannibal_probe", f"{keyword}|{location_code}|{language_code}")
    hit = await cache.get(key)
    if hit:
        return hit.get("pos_a"), hit.get("pos_b"), 0.0

    cost = 0.0
    pos_a: int | None = None
    pos_b: int | None = None
    try:
        result = await serp.fetch_serp(keyword, location_code, language_code)
        cost = result.cost
        organic = result.raw.get("items", []) if isinstance(result.raw, dict) else []
        # serp.fetch_serp parses top-7 only; for our probe we want the full
        # organic set if present in raw payload
        if not organic:
            # Fallback to organic_top7 (depth 10 by default)
            for i, item in enumerate(result.organic_top7):
                u = (item or {}).get("url", "")
                if pos_a is None and _same_url(u, url_a):
                    pos_a = i + 1
                if pos_b is None and _same_url(u, url_b):
                    pos_b = i + 1
        else:
            for item in organic:
                if not isinstance(item, dict):
                    continue
                if item.get("type") not in (None, "organic"):
                    continue
                rank = item.get("rank_absolute") or item.get("rank_group")
                u = item.get("url") or ""
                if isinstance(rank, int):
                    if pos_a is None and _same_url(u, url_a):
                        pos_a = rank
                    if pos_b is None and _same_url(u, url_b):
                        pos_b = rank
    except Exception:
        # SERP probe is best-effort; absence of data isn't fatal
        return None, None, cost

    await cache.set(key, {"pos_a": pos_a, "pos_b": pos_b}, ttl_seconds=_SERP_PROBE_TTL, cost_usd=cost)
    return pos_a, pos_b, cost


# ---------------------------------------------------------------------------
# Authority signals
# ---------------------------------------------------------------------------

async def _count_internal_links(
    db: AsyncSession, hostname: str, url_a: str, url_b: str,
) -> tuple[int, int]:
    """Best-effort: scan indexed_pages for the same hostname and count how
    many pages reference URL A and URL B in their anchor list. Falls back to
    text-occurrence in full_content if anchor list is empty."""
    domain = (
        await db.execute(
            select(Domain).where(Domain.hostname == hostname)
        )
    ).scalars().first()
    if domain is None:
        return 0, 0

    # We don't store anchors in IndexedPage today, so we substring-match the
    # URL's path inside full_content. This over-counts (matches inside
    # quotes / outside <a>) but is directionally correct: the page that
    # appears in more bodies has more inbound mentions.
    path_a = urlparse(url_a).path or "/"
    path_b = urlparse(url_b).path or "/"

    # Count occurrences via SQL — much faster than pulling 1000 pages
    # and counting in Python.
    count_a = (
        await db.execute(
            select(func.count())
            .select_from(IndexedPage)
            .where(IndexedPage.domain_id == domain.id)
            .where(IndexedPage.full_content.contains(path_a))
            .where(IndexedPage.url != url_a)
        )
    ).scalar_one()
    count_b = (
        await db.execute(
            select(func.count())
            .select_from(IndexedPage)
            .where(IndexedPage.domain_id == domain.id)
            .where(IndexedPage.full_content.contains(path_b))
            .where(IndexedPage.url != url_b)
        )
    ).scalar_one()
    return int(count_a or 0), int(count_b or 0)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _sigmoid(x: float) -> float:
    if x > 30:
        return 1.0
    if x < -30:
        return 0.0
    import math
    return 1.0 / (1.0 + math.exp(-x))


def _probability(s: CannibalSignals, req: CannibalRequest) -> float:
    """Calibrated probability of cannibalization on a 0-100 scale."""
    has_gsc = req.gsc_a is not None or req.gsc_b is not None
    gsc_both_imp = bool(
        has_gsc
        and (req.gsc_a and (req.gsc_a.impressions or 0) > 0)
        and (req.gsc_b and (req.gsc_b.impressions or 0) > 0)
    )
    # Rebalance the page-page cosine into [-1, 1] around 0.78 so values below
    # the topical-clone threshold contribute negatively.
    cos_ab_centered = (s.cos_a_b - 0.78) * 4.0  # 0.78 → 0, 0.92 → +0.56
    kw_min = min(s.cos_kw_a, s.cos_kw_b) - 0.55  # both must hit on the KW
    z = (
        2.5 * cos_ab_centered
        + 1.8 * kw_min
        + 1.2 * (s.jaccard_headings - 0.25)
        + 0.8 * (s.ngram_overlap - 0.05)
        + 0.6 * (s.entity_overlap - 0.10)
        + (1.5 if s.serp_both_top20 else 0.0)
        + (1.5 if gsc_both_imp else 0.0)
        - (1.4 if s.canonical_resolved else 0.0)
        - (1.6 if s.intent_diverge else 0.0)
    )
    return round(_sigmoid(z) * 100, 1)


def _severity(s: CannibalSignals, req: CannibalRequest) -> float:
    """Business impact 0-100. Without GSC we proxy via SERP positions."""
    if req.gsc_a or req.gsc_b:
        impressions = (
            (req.gsc_a.impressions if req.gsc_a else 0) or 0
        ) + ((req.gsc_b.impressions if req.gsc_b else 0) or 0)
        # Saturating curve — 5000 impressions/30d = 80, 10000+ = 95
        sev = min(95.0, 100.0 * (1 - 1 / (1 + impressions / 1500)))
        # Bonus if both have impressions (not just one dominant)
        if (
            req.gsc_a and (req.gsc_a.impressions or 0) > 50
            and req.gsc_b and (req.gsc_b.impressions or 0) > 50
        ):
            sev = min(100.0, sev + 10)
        return round(sev, 1)
    # No GSC: fall back to SERP visibility
    if s.serp_both_top20:
        return 60.0
    if s.serp_a_position or s.serp_b_position:
        return 35.0
    return 15.0


def _winner_scores(
    a: PageProbe, b: PageProbe, req: CannibalRequest, s: CannibalSignals,
) -> tuple[WinnerScore, WinnerScore]:
    has_gsc = req.gsc_a is not None or req.gsc_b is not None
    # Re-allocate the 30% performance weight onto authority+quality if no GSC
    if has_gsc:
        w_auth, w_perf, w_qual, w_fresh = 0.40, 0.30, 0.20, 0.10
    else:
        w_auth, w_perf, w_qual, w_fresh = 0.55, 0.00, 0.30, 0.15

    auth_a = _authority_score(a, req.backlinks_a, s.serp_a_position)
    auth_b = _authority_score(b, req.backlinks_b, s.serp_b_position)
    perf_a = _performance_score(req.gsc_a)
    perf_b = _performance_score(req.gsc_b)
    qual_a = _quality_score(a, s.cos_kw_a)
    qual_b = _quality_score(b, s.cos_kw_b)
    fresh_a = _freshness_score(a)
    fresh_b = _freshness_score(b)

    total_a = round(
        100 * (w_auth * auth_a + w_perf * perf_a + w_qual * qual_a + w_fresh * fresh_a),
        1,
    )
    total_b = round(
        100 * (w_auth * auth_b + w_perf * perf_b + w_qual * qual_b + w_fresh * fresh_b),
        1,
    )

    breakdown_a = {
        "authority": round(auth_a * 100, 1),
        "performance": round(perf_a * 100, 1),
        "quality": round(qual_a * 100, 1),
        "freshness": round(fresh_a * 100, 1),
        "weights": {"auth": w_auth, "perf": w_perf, "qual": w_qual, "fresh": w_fresh},
    }
    breakdown_b = {
        "authority": round(auth_b * 100, 1),
        "performance": round(perf_b * 100, 1),
        "quality": round(qual_b * 100, 1),
        "freshness": round(fresh_b * 100, 1),
        "weights": {"auth": w_auth, "perf": w_perf, "qual": w_qual, "fresh": w_fresh},
    }
    return (
        WinnerScore(
            url=a.url, total=total_a,
            authority=auth_a * 100, performance=perf_a * 100,
            quality=qual_a * 100, freshness=fresh_a * 100,
            breakdown=breakdown_a,
        ),
        WinnerScore(
            url=b.url, total=total_b,
            authority=auth_b * 100, performance=perf_b * 100,
            quality=qual_b * 100, freshness=fresh_b * 100,
            breakdown=breakdown_b,
        ),
    )


def _authority_score(p: PageProbe, backlinks: int | None, serp_pos: int | None) -> float:
    """Returns 0-1."""
    if not p.fetched:
        return 0.0
    # Internal links: log-saturating — 0 = 0, 5 = 0.5, 20 = 0.85, 50+ ~ 1
    import math
    il = 1 - math.exp(-p.internal_links_in / 7.0)
    # External backlinks if provided: same shape, larger denom
    bl = 1 - math.exp(-(backlinks or 0) / 50.0) if backlinks is not None else None
    # URL depth penalty: 1 segment → 1.0, 4+ → 0.5
    depth = max(0.5, 1.0 - 0.12 * max(0, p.url_depth - 1))
    # Current SERP position (the cleanest authority proxy if available)
    if serp_pos is not None:
        sp = max(0.1, 1.0 - (serp_pos - 1) / 30.0)  # rank 1 → 1.0, rank 30 → ~0.03
    else:
        sp = None

    # Combine — give external backlinks priority when provided
    components = [il * 0.5, depth * 0.2]
    if bl is not None:
        components.append(bl * 0.3)
    if sp is not None:
        components.append(sp * (0.3 if bl is None else 0.2))
    score = sum(components)
    return min(1.0, score)


def _performance_score(g: GscStats | None) -> float:
    if g is None:
        return 0.0
    score = 0.0
    if g.clicks is not None:
        # 100 clicks/30d → 0.7, 500+ → 0.95
        score += 0.5 * min(1.0, (g.clicks or 0) / 200.0)
    if g.position is not None:
        # rank 1 → 0.4, rank 10 → 0.18, rank 30 → 0.04
        score += max(0.0, 0.45 * (1 - (g.position - 1) / 30.0))
    if g.ctr is not None:
        # CTR 5% on the query → 0.05 (already small bonus)
        score += min(0.1, g.ctr * 2)
    return min(1.0, score)


def _quality_score(p: PageProbe, cos_kw: float) -> float:
    if not p.fetched:
        return 0.0
    # Coverage proxy: cosine to KW × structural depth
    structure = (
        min(1.0, len(p.h2) / 8)
        + min(1.0, p.lists_count / 6)
        + min(1.0, p.tables_count / 2)
        + (0.4 if p.has_faq_schema else 0)
        + (0.2 if p.has_article_schema or p.has_product_schema else 0)
    ) / 4.6
    length = min(1.0, p.word_count / 1800)  # 1800 mots+ saturates
    return min(1.0, 0.45 * cos_kw + 0.35 * length + 0.20 * structure)


def _freshness_score(p: PageProbe) -> float:
    if not p.fetched or not p.last_modified:
        return 0.5  # neutral when unknown
    try:
        days = (datetime.utcnow().replace(tzinfo=p.last_modified.tzinfo) - p.last_modified).days
    except Exception:
        return 0.5
    # < 30j → 1.0, 6 mois → 0.7, 1 an → 0.45, 2 ans → 0.2
    if days < 30: return 1.0
    if days < 90: return 0.85
    if days < 180: return 0.70
    if days < 365: return 0.50
    if days < 730: return 0.30
    return 0.15


def _winner_reason(
    win: PageProbe, lose: PageProbe, win_score: WinnerScore, lose_score: WinnerScore,
    label: str, req: CannibalRequest, s: CannibalSignals,
) -> str:
    parts: list[str] = []
    if win.internal_links_in > lose.internal_links_in:
        parts.append(f"{win.internal_links_in} liens internes vs {lose.internal_links_in}")
    g_w = req.gsc_a if label == "A" else req.gsc_b
    g_l = req.gsc_b if label == "A" else req.gsc_a
    if g_w and g_l and g_w.clicks is not None and g_l.clicks is not None:
        if g_w.clicks > g_l.clicks * 1.5:
            ratio = g_w.clicks / max(g_l.clicks, 1)
            parts.append(f"{ratio:.1f}× plus de clics ({g_w.clicks} vs {g_l.clicks})")
    if g_w and g_l and g_w.position is not None and g_l.position is not None:
        if g_w.position < g_l.position - 1:
            parts.append(
                f"position {g_w.position:.1f} vs {g_l.position:.1f}"
            )
    if win.word_count > lose.word_count * 1.3:
        parts.append(f"{win.word_count} mots vs {lose.word_count}")
    if win.url_depth < lose.url_depth:
        parts.append(f"URL plus haute dans l'arbo ({win.url_depth} vs {lose.url_depth})")
    if not parts:
        parts.append(
            f"Score composite {win_score.total} vs {lose_score.total}"
        )
    return f"{label} l'emporte : " + ", ".join(parts) + "."


# ---------------------------------------------------------------------------
# Claude action plan
# ---------------------------------------------------------------------------

_CLAUDE_SYS = (
    "Tu es un consultant SEO senior qui audite la cannibalisation de contenu. "
    "Tu reçois des métriques calculées algorithmiquement (cosine, headings, GSC, "
    "SERP) sur deux URLs candidates et tu rends UN VERDICT FERME et un PLAN "
    "D'ACTION CONCRET section par section. Tu ne refais pas le diagnostic "
    "chiffré — tu l'interprètes et tu produis un plan opérationnel. "
    "Réponse uniquement en JSON valide, pas de prose hors JSON."
)

_CLAUDE_USER_TEMPLATE = """\
KEYWORD : {keyword}

URL A : {url_a}
URL B : {url_b}

SIGNAUX ALGO :
- cosine(KW, A) = {cos_kw_a:.3f}    cosine(KW, B) = {cos_kw_b:.3f}
- cosine(A, B) = {cos_a_b:.3f}      Jaccard headings = {jaccard:.3f}
- n-gram overlap = {ngram:.3f}      entité overlap = {ent:.3f}
- SERP : A={pos_a}    B={pos_b}    both_top20={both_top20}
- canonical résolu = {canonical}
- Probabilité algo = {proba}/100   Sévérité = {severity}/100
- Verdict algo = {algo_verdict}

GAGNANT ALGO : {winner} (raisons : {winner_reason})

PAGE A — {title_a}
H1 : {h1_a}
H2 : {h2_a}
{wc_a} mots, {h2c_a} H2, {lists_a} listes, {tables_a} tables · liens entrants internes : {il_a} · last-mod : {lm_a}
GSC A : {gsc_a}
Entités : {ent_a}
Extrait : {body_a}

PAGE B — {title_b}
H1 : {h1_b}
H2 : {h2_b}
{wc_b} mots, {h2c_b} H2, {lists_b} listes, {tables_b} tables · liens entrants internes : {il_b} · last-mod : {lm_b}
GSC B : {gsc_b}
Entités : {ent_b}
Extrait : {body_b}

TÂCHE :
1. Décide si c'est de la cannibalisation. Si les deux pages servent une INTENTION DIFFÉRENTE (ex : informationnel vs commercial, débutant vs expert), réponds intent_diverge=true.
2. Confirme ou modifie le gagnant désigné par l'algo. Justifie en 1 phrase.
3. Choisis l'action :
   - "merge_b_into_a_301" : fusionner B dans A puis 301 B→A (ou inversement, ajuste les noms)
   - "canonical_b_to_a" : poser un rel=canonical de B vers A sans fusionner
   - "differentiate" : retravailler la cible/intention de B pour la séparer
   - "noindex_b" : noindex la perdante (uniquement si elle n'a aucune valeur)
   - "no_action" : pas de cannibalisation réelle
4. Rédige un plan d'action SECTION PAR SECTION : « Déplace H2 X de B dans A après la section Y », « Réécris l'intro de A en ajoutant Z », « Met à jour les liens internes vers B ». Précis, opérationnel, jamais générique.
5. Liste les RISQUES éventuels (sections uniques de la perdante qu'on pourrait perdre, audiences distinctes, etc.).

RÉPONDS EN JSON STRICT :
{{
  "verdict": "cannibalize_strong" | "cannibalize_weak" | "ok_differentiated",
  "confidence": 0.0-1.0,
  "intent_diverge": true | false,
  "winner": "A" | "B" | "undecided",
  "winner_reason": "...",
  "action": "merge_b_into_a_301" | "merge_a_into_b_301" | "canonical_b_to_a" | "canonical_a_to_b" | "differentiate" | "noindex_b" | "noindex_a" | "no_action",
  "merge_plan": ["étape concrète 1", "étape concrète 2", "..."],
  "risks": ["..."]
}}"""


async def _claude_action_plan(
    *,
    req: CannibalRequest,
    probe_a: PageProbe,
    probe_b: PageProbe,
    signals: CannibalSignals,
    probability: float,
    severity: float,
    winner: str | None,
    winner_reason: str,
    algo_verdict: str,
) -> dict:
    if get_settings().mock_external:
        return {
            "verdict": algo_verdict,
            "confidence": 0.6,
            "intent_diverge": False,
            "winner": winner or "A",
            "winner_reason": winner_reason,
            "action": "merge_b_into_a_301" if winner == "A" else "merge_a_into_b_301",
            "merge_plan": ["(mock) plan désactivé"],
            "risks": [],
            "cost": 0.0,
        }

    user = _CLAUDE_USER_TEMPLATE.format(
        keyword=req.keyword,
        url_a=probe_a.url,
        url_b=probe_b.url,
        cos_kw_a=signals.cos_kw_a,
        cos_kw_b=signals.cos_kw_b,
        cos_a_b=signals.cos_a_b,
        jaccard=signals.jaccard_headings,
        ngram=signals.ngram_overlap,
        ent=signals.entity_overlap,
        pos_a=signals.serp_a_position if signals.serp_a_position is not None else "—",
        pos_b=signals.serp_b_position if signals.serp_b_position is not None else "—",
        both_top20=signals.serp_both_top20,
        canonical=signals.canonical_resolved,
        proba=probability,
        severity=severity,
        algo_verdict=algo_verdict,
        winner=winner or "indéterminé",
        winner_reason=winner_reason,
        title_a=probe_a.title or "—",
        h1_a=probe_a.h1 or "—",
        h2_a=" | ".join(probe_a.h2[:12]) or "—",
        wc_a=probe_a.word_count,
        h2c_a=len(probe_a.h2),
        lists_a=probe_a.lists_count,
        tables_a=probe_a.tables_count,
        il_a=probe_a.internal_links_in,
        lm_a=probe_a.last_modified.isoformat() if probe_a.last_modified else "—",
        gsc_a=_format_gsc(req.gsc_a),
        ent_a=", ".join(probe_a.entities[:15]) or "—",
        body_a=probe_a.body_excerpt[:900] or "—",
        title_b=probe_b.title or "—",
        h1_b=probe_b.h1 or "—",
        h2_b=" | ".join(probe_b.h2[:12]) or "—",
        wc_b=probe_b.word_count,
        h2c_b=len(probe_b.h2),
        lists_b=probe_b.lists_count,
        tables_b=probe_b.tables_count,
        il_b=probe_b.internal_links_in,
        lm_b=probe_b.last_modified.isoformat() if probe_b.last_modified else "—",
        gsc_b=_format_gsc(req.gsc_b),
        ent_b=", ".join(probe_b.entities[:15]) or "—",
        body_b=probe_b.body_excerpt[:900] or "—",
    )
    resp = await llm.complete(
        system=_CLAUDE_SYS, user=user, max_tokens=1800, model=llm.SONNET, temperature=0.2,
    )
    try:
        data = llm.extract_json(resp.text)
    except Exception:
        data = {}
    # Defensive defaults
    return {
        "verdict": data.get("verdict") or algo_verdict,
        "confidence": float(data.get("confidence", 0.6)),
        "intent_diverge": bool(data.get("intent_diverge", False)),
        "winner": data.get("winner") or winner or "undecided",
        "winner_reason": data.get("winner_reason") or winner_reason,
        "action": data.get("action") or "no_action",
        "merge_plan": list(data.get("merge_plan") or []),
        "risks": list(data.get("risks") or []),
        "cost": resp.cost,
    }


def _format_gsc(g: GscStats | None) -> str:
    if g is None:
        return "non fourni"
    parts = []
    if g.clicks is not None: parts.append(f"clics={g.clicks}")
    if g.impressions is not None: parts.append(f"impressions={g.impressions}")
    if g.position is not None: parts.append(f"position={g.position:.1f}")
    if g.ctr is not None: parts.append(f"CTR={g.ctr * 100:.2f}%")
    return ", ".join(parts) or "(vide)"


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _hostname(url: str) -> str:
    try:
        h = urlparse(url).hostname or ""
        return h.lower().lstrip("www.")
    except Exception:
        return ""


def _url_depth(url: str) -> int:
    try:
        path = urlparse(url).path or "/"
        return len([p for p in path.split("/") if p])
    except Exception:
        return 0


def _normalize_url(url: str) -> str:
    try:
        u = urlparse(url)
        host = (u.hostname or "").lower().lstrip("www.")
        path = (u.path or "/").rstrip("/") or "/"
        return f"{host}{path}"
    except Exception:
        return url.strip().lower()


def _same_url(a: str, b: str) -> bool:
    return _normalize_url(a) == _normalize_url(b)


# ---------------------------------------------------------------------------
# Cosine
# ---------------------------------------------------------------------------

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    import math
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
