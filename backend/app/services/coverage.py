"""Semantic coverage scoring: cosine between expected terms embedding and content chunks."""
from __future__ import annotations

import math

from app.services.embeddings import chunks, embed


async def coverage_score(*, expected_terms: list[str], content_text: str) -> float:
    if not expected_terms or not content_text.strip():
        return 0.0

    expected_text = " ; ".join(expected_terms[:50])
    [expected_vec] = await embed([expected_text])

    chunk_list = list(chunks(content_text, size=400))
    if not chunk_list:
        return 0.0
    chunk_vecs = await embed(chunk_list)

    sims = [_cosine(expected_vec, v) for v in chunk_vecs]
    if not sims:
        return 0.0
    sims.sort(reverse=True)
    top = sims[: max(1, len(sims) // 3)]
    raw = sum(top) / len(top)
    return round(max(0.0, min(1.0, (raw + 1) / 2)) * 100, 2)


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
