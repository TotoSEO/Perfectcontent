"""Score and select the most opportune GSC keywords to integrate in a page.

Calibrated on Thot SEO's study: pages that contain a query verbatim (or
semi-verbatim) rank x1.7 more often in the top 10 and x2.2 in the top 3.
The first occurrence delivers most of the gain — additional repetitions
yield marginal returns.

Pipeline:
  1. Score every GSC row by a combined priority that captures
       - volume potential       (log impressions)
       - position opportunity   (peak around #8-12, drops past #30)
       - keyword gap            (rendements décroissants à partir d'1
                                 occurrence dans le contenu)
       - CTR gap bonus          (CTR observé < CTR attendu pour la pos.)
  2. Cluster keywords by Jaccard ≥ 0.5 on lemmatised stem-sets so
     "doudoune chaude" and "doudoune chaude femme" land in the same
     cluster — we don't want to recommend 8 variants of the same root.
  3. Pick at most 2 keywords per cluster (the highest priority). Take
     the top 10 by priority across clusters; if fewer than 3 distinct
     clusters are represented, expand up to 15 to guarantee diversity.
  4. Detect exact / semi-exact occurrences of each kept keyword in the
     pasted content and store the count.

Cap rule: if the source CSV has only N < 10 rows, return all N. We don't
hallucinate keywords.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field

from app.services.gsc_csv import GscRow
from app.services.term_freq import _is_stop, stem_fr


@dataclass
class ScoredKeyword:
    query: str
    clicks: int
    impressions: int
    ctr: float
    position: float
    priority: float
    cluster_id: int
    count_exact: int = 0
    count_semi: int = 0
    occurrences: list[tuple[int, int]] = field(default_factory=list)
    # ↑ char ranges in the content for highlighting (start, end) pairs

    def to_dict(self) -> dict:
        return {
            "query": self.query,
            "clicks": self.clicks,
            "impressions": self.impressions,
            "ctr": round(self.ctr, 4),
            "position": round(self.position, 1),
            "priority": round(self.priority, 4),
            "cluster_id": self.cluster_id,
            "count_exact": self.count_exact,
            "count_semi": self.count_semi,
            "occurrences": self.occurrences,
        }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def _position_opportunity(pos: float) -> float:
    """Curve: 0 at #1 (already winning), peaks at #8-12, decays past #30.

      pos=1   → 0.10  (already top, low marginal value)
      pos=3   → 0.45
      pos=8   → 1.00  (peak)
      pos=12  → 0.95
      pos=20  → 0.55
      pos=30  → 0.20
      pos=50  → 0.05
      pos>60  → 0.0
    """
    if pos <= 0:
        return 0.0
    if pos <= 1:
        return 0.10
    if pos >= 60:
        return 0.0
    # Triangular peak around 8-12
    if pos <= 10:
        # ramp up: 1 → 0.10, 10 → 1.0
        return min(1.0, 0.10 + (pos - 1) * 0.10)
    # decay from 10 to 60
    decay = max(0.0, 1.0 - (pos - 10) / 50.0)
    return decay


def _keyword_gap(count_exact: int, count_semi: int) -> float:
    """Diminishing returns: 0× → 1.0, 1× → 0.4, 2× → 0.2, ≥3× → 0."""
    total = count_exact + 0.5 * count_semi  # semi counts half
    if total <= 0:
        return 1.0
    if total < 1:
        return 0.7
    if total < 2:
        return 0.4
    if total < 3:
        return 0.2
    return 0.0


def _expected_ctr_for_position(pos: float) -> float:
    """Empirical CTR curve from public SEO datasets (averaged over multiple
    studies). Used only for the CTR-gap bonus — a query whose observed CTR
    is below the position-expected CTR has obvious upside if the user
    optimises the page's relevance signals (= keyword integration)."""
    table = [
        (1, 0.27), (2, 0.155), (3, 0.105), (4, 0.075), (5, 0.055),
        (6, 0.045), (7, 0.035), (8, 0.030), (9, 0.025), (10, 0.022),
        (15, 0.012), (20, 0.008), (30, 0.005), (50, 0.002), (100, 0.001),
    ]
    if pos <= table[0][0]:
        return table[0][1]
    if pos >= table[-1][0]:
        return table[-1][1]
    for i in range(len(table) - 1):
        p0, c0 = table[i]
        p1, c1 = table[i + 1]
        if p0 <= pos <= p1:
            t = (pos - p0) / (p1 - p0)
            return c0 + (c1 - c0) * t
    return 0.001


def _ctr_gap_bonus(observed: float, position: float) -> float:
    """Bonus 1.0..1.4 when observed CTR is well below the expected CTR
    at the page's average position."""
    expected = _expected_ctr_for_position(position)
    if expected <= 0:
        return 1.0
    ratio = observed / expected
    if ratio < 0.5:
        return 1.4
    if ratio < 0.75:
        return 1.2
    if ratio < 1.0:
        return 1.1
    return 1.0


def _priority(row: GscRow, count_exact: int, count_semi: int) -> float:
    """Combined opportunity score. The Thot study justifies using
    keyword_gap as a multiplicative factor (above 1× the gain is marginal,
    so the score should drop sharply)."""
    vol = math.log(max(0, row.impressions) + 1)
    pos_op = _position_opportunity(row.position)
    gap = _keyword_gap(count_exact, count_semi)
    ctr_bonus = _ctr_gap_bonus(row.ctr, row.position)
    return vol * pos_op * gap * ctr_bonus


# ---------------------------------------------------------------------------
# Stem-based clustering
# ---------------------------------------------------------------------------

_WORD_RE = re.compile(
    r"[a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ][a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ\-']*",
)


def _stem_set(query: str) -> set[str]:
    """Lemmatised stems of all non-stopword tokens, length >= 3."""
    out: set[str] = set()
    for m in _WORD_RE.finditer(query):
        w = m.group(0).lower().strip("-'")
        if len(w) < 3:
            continue
        if _is_stop(w):
            continue
        out.add(stem_fr(w))
    return out


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if inter == 0:
        return 0.0
    union = len(a | b)
    return inter / union if union else 0.0


def _cluster_keywords(rows: list[GscRow]) -> list[int]:
    """Assign each row a cluster_id. Two queries land in the same cluster
    when their stem-sets share Jaccard ≥ 0.5 with the cluster's
    representative (the highest-impressions row that started the cluster).
    """
    cluster_ids: list[int] = []
    cluster_reps: list[set[str]] = []  # representative stem-set per cluster
    for r in rows:
        stems = _stem_set(r.query)
        cid = -1
        for i, rep in enumerate(cluster_reps):
            # Treat full-subset as same cluster regardless of size delta
            if stems and rep and (stems.issubset(rep) or rep.issubset(stems)):
                if _jaccard(stems, rep) >= 0.4:
                    cid = i
                    break
            elif _jaccard(stems, rep) >= 0.5:
                cid = i
                break
        if cid < 0:
            cid = len(cluster_reps)
            cluster_reps.append(stems)
        cluster_ids.append(cid)
    return cluster_ids


# ---------------------------------------------------------------------------
# Exact / semi-exact occurrence detection
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    s = text.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s


def _tokens_with_offsets(text: str) -> list[tuple[str, int, int]]:
    """List of (normalised_token, char_start, char_end) for the original text."""
    out: list[tuple[str, int, int]] = []
    for m in _WORD_RE.finditer(text):
        w = m.group(0).lower().strip("-'")
        if len(w) < 1:
            continue
        norm = _normalize(w)
        out.append((norm, m.start(), m.end()))
    return out


def detect_occurrences(content: str, query: str) -> tuple[int, int, list[tuple[int, int]]]:
    """Return (count_exact, count_semi, [char_ranges_for_each_match]).

      - exact: all query tokens appear consecutively (allowing a single
        stopword between content tokens, since "doudoune chaude" might be
        in the page as "doudoune très chaude").
      - semi-exact: ≥ ⌈n/2⌉ query content-tokens appear in the same
        sentence, in any order, where n = number of content tokens in the
        query (after stripping stopwords).
    """
    if not content or not query:
        return 0, 0, []

    q_norm_tokens = [t[0] for t in _tokens_with_offsets(query)]
    if not q_norm_tokens:
        return 0, 0, []

    content_tokens = _tokens_with_offsets(content)
    if not content_tokens:
        return 0, 0, []

    # ---- EXACT (with up to 1 stopword tolerance between query tokens) ----
    exact_ranges: list[tuple[int, int]] = []
    n = len(content_tokens)
    qn = len(q_norm_tokens)
    i = 0
    while i < n:
        # Try to match q_norm_tokens starting at i, allowing stop-word skips
        j = i
        qi = 0
        skip_used = 0
        match_start_char = content_tokens[i][1]
        match_end_char = content_tokens[i][2]
        while qi < qn and j < n:
            ct = content_tokens[j][0]
            qt = q_norm_tokens[qi]
            if ct == qt:
                match_end_char = content_tokens[j][2]
                j += 1
                qi += 1
            elif _is_stop(content_tokens[j][0]) and skip_used < 2 and qi > 0:
                # tolerant insert — small connector words inside the phrase
                j += 1
                skip_used += 1
            else:
                break
        if qi == qn:
            exact_ranges.append((match_start_char, match_end_char))
            i = j
        else:
            i += 1

    # Strip exact-overlap from the content for the semi pass
    exact_token_idx: set[int] = set()
    for start, end in exact_ranges:
        for k, (_, ts, te) in enumerate(content_tokens):
            if ts >= start and te <= end:
                exact_token_idx.add(k)

    # ---- SEMI-EXACT — same sentence, in any order ----
    # Strip stopwords from the query content tokens.
    q_content_norm = [t for t in q_norm_tokens if not _is_stop(t)]
    if not q_content_norm:
        return len(exact_ranges), 0, exact_ranges

    # For a 1-content-token query, the exact pass is the only signal
    # (a single token appearing in the page is exact, not semi).
    if len(q_content_norm) == 1:
        return len(exact_ranges), 0, exact_ranges

    # For 2-token queries we require BOTH tokens in the sentence (otherwise
    # "duvet d'oie" would semi-match any sentence mentioning "duvet" alone,
    # which is too loose). For longer queries we require ⌈2n/3⌉ tokens —
    # the corpus must really echo the query, not just brush against it.
    n = len(q_content_norm)
    needed = max(2, (n * 2 + 2) // 3)
    q_set = set(q_content_norm)

    # Sentence boundaries by character position
    sentence_breaks = [
        m.start() for m in re.finditer(r"[.!?…\n]+", content)
    ]
    sentence_starts = [0] + [b + 1 for b in sentence_breaks]

    semi_ranges: list[tuple[int, int]] = []
    s_idx = 0
    sentence_token_buckets: list[list[int]] = []
    for k, (_, ts, _te) in enumerate(content_tokens):
        while s_idx < len(sentence_starts) - 1 and ts >= sentence_starts[s_idx + 1]:
            s_idx += 1
        while len(sentence_token_buckets) <= s_idx:
            sentence_token_buckets.append([])
        sentence_token_buckets[s_idx].append(k)

    for bucket in sentence_token_buckets:
        # Skip tokens already covered by exact
        free = [k for k in bucket if k not in exact_token_idx]
        if not free:
            continue
        seen = set()
        first_match_idx: int | None = None
        last_match_idx: int | None = None
        for k in free:
            tok = content_tokens[k][0]
            if tok in q_set:
                seen.add(tok)
                if first_match_idx is None:
                    first_match_idx = k
                last_match_idx = k
        if len(seen) >= needed and first_match_idx is not None and last_match_idx is not None:
            semi_ranges.append(
                (
                    content_tokens[first_match_idx][1],
                    content_tokens[last_match_idx][2],
                )
            )

    all_ranges = exact_ranges + semi_ranges
    all_ranges.sort()
    return len(exact_ranges), len(semi_ranges), all_ranges


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def select_opportunities(
    rows: list[GscRow],
    content: str,
    *,
    target: int = 10,
    max_total: int = 15,
    min_clusters: int = 3,
    max_per_cluster: int = 2,
) -> list[ScoredKeyword]:
    """Score, cluster, deduplicate and select the most opportune keywords.

    Returns at most `max_total` keywords. The default target is 10 but if
    fewer than `min_clusters` distinct clusters are represented, we expand
    up to `max_total` to surface alternative angles.

    The returned list is sorted by priority DESC and includes the in-content
    occurrence counts for the live UI.
    """
    if not rows:
        return []

    # 1. Pre-compute occurrences for every row so the priority can use
    #    keyword_gap. Also useful for the UI no matter which rows we pick.
    enriched: list[tuple[GscRow, int, int, list[tuple[int, int]]]] = []
    for r in rows:
        ce, cs, ranges = detect_occurrences(content, r.query)
        enriched.append((r, ce, cs, ranges))

    # 2. Score
    cluster_ids = _cluster_keywords([e[0] for e in enriched])
    scored: list[ScoredKeyword] = []
    for (row, ce, cs, ranges), cid in zip(enriched, cluster_ids):
        scored.append(
            ScoredKeyword(
                query=row.query,
                clicks=row.clicks,
                impressions=row.impressions,
                ctr=row.ctr,
                position=row.position,
                priority=_priority(row, ce, cs),
                cluster_id=cid,
                count_exact=ce,
                count_semi=cs,
                occurrences=ranges,
            )
        )

    # 3. Sort by priority DESC
    scored.sort(key=lambda k: -k.priority)

    # 4. Cluster diversity selection
    seen_per_cluster: dict[int, int] = {}
    primary: list[ScoredKeyword] = []
    secondary: list[ScoredKeyword] = []
    for kw in scored:
        used = seen_per_cluster.get(kw.cluster_id, 0)
        if used == 0:
            primary.append(kw)
            seen_per_cluster[kw.cluster_id] = 1
        elif used < max_per_cluster:
            secondary.append(kw)
            seen_per_cluster[kw.cluster_id] = used + 1
        # else skip — cluster already has max_per_cluster reps

    # Round-robin: alternate primary (one per cluster) then secondary in
    # priority order. This way the first 10 always span as many clusters
    # as possible, falling back to the second-best of each only when we
    # need more.
    final = primary[:target]

    if len(final) < target:
        # Top up with secondaries, still in priority order
        for kw in secondary:
            if len(final) >= target:
                break
            final.append(kw)

    distinct_clusters = len({k.cluster_id for k in final})
    if distinct_clusters < min_clusters:
        # Expand beyond `target` to bring in more clusters
        considered = set(id(k) for k in final)
        for kw in primary + secondary:
            if id(kw) in considered:
                continue
            final.append(kw)
            considered.add(id(kw))
            if len({k.cluster_id for k in final}) >= min_clusters:
                break
            if len(final) >= max_total:
                break

    # Hard cap
    final = final[:max_total]

    # Re-sort the final by priority for display
    final.sort(key=lambda k: -k.priority)
    return final
