"""OpenAI text-embedding-3-small with batching + Redis cache."""
from __future__ import annotations

import hashlib
import json
from typing import Iterable

import httpx

from app.cache import get_redis
from app.config import get_settings

DIM = 1536
MODEL = "text-embedding-3-small"
BATCH_SIZE = 96


def _key(text: str) -> str:
    return f"pc:emb:{hashlib.sha1(text.encode('utf-8')).hexdigest()}"


async def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if get_settings().mock_external:
        return [_mock_vector(t) for t in texts]

    r = get_redis()
    cached: dict[int, list[float]] = {}
    miss_idx: list[int] = []
    miss_texts: list[str] = []
    for i, t in enumerate(texts):
        raw = await r.get(_key(t))
        if raw is not None:
            cached[i] = json.loads(raw)
        else:
            miss_idx.append(i)
            miss_texts.append(t)

    if miss_texts:
        async with httpx.AsyncClient(timeout=60) as client:
            for batch_start in range(0, len(miss_texts), BATCH_SIZE):
                batch = miss_texts[batch_start : batch_start + BATCH_SIZE]
                resp = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {get_settings().openai_api_key}"},
                    json={"model": MODEL, "input": batch},
                )
                resp.raise_for_status()
                data = resp.json()["data"]
                for offset, item in enumerate(data):
                    pos = miss_idx[batch_start + offset]
                    text = texts[pos]
                    vec = item["embedding"]
                    cached[pos] = vec
                    await r.set(_key(text), json.dumps(vec), ex=60 * 60 * 24 * 30)

    return [cached[i] for i in range(len(texts))]


def chunks(text: str, size: int = 500) -> Iterable[str]:
    """Naive whitespace chunker."""
    words = text.split()
    for i in range(0, len(words), size):
        yield " ".join(words[i : i + size])


def _mock_vector(text: str) -> list[float]:
    """Deterministic pseudo-embedding for offline tests."""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    repeated = (h * ((DIM // len(h)) + 1))[:DIM]
    # Map bytes 0-255 → -1..1
    return [(b / 255.0) * 2 - 1 for b in repeated]
