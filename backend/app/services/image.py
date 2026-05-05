"""Image generation. Two backends supported, both opt-in.

- OpenAI gpt-image-1 / DALL-E 3 — uses the OPENAI_API_KEY already configured.
- Fal.ai Flux Pro — fallback if FAL_API_KEY is set.

Default behaviour: do NOT generate. Just expose the prompt; the user can
trigger generation manually from the editor or copy the prompt elsewhere.
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import get_settings

OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"
FAL_URL = "https://fal.run/fal-ai/flux-pro"
OPENAI_COST = 0.04  # gpt-image-1 standard 1024x1024 (~)
FAL_COST = 0.03


@dataclass
class ImageResult:
    url: str
    prompt: str
    cost: float
    backend: str  # "openai" | "fal" | "mock" | "skipped"


async def generate_image(prompt: str, *, backend: str = "auto") -> ImageResult:
    settings = get_settings()
    if settings.mock_external:
        return ImageResult(
            url="https://placehold.co/1024x576/png?text=Mock",
            prompt=prompt,
            cost=0.0,
            backend="mock",
        )

    chosen = backend
    if chosen == "auto":
        if settings.openai_api_key:
            chosen = "openai"
        elif settings.fal_api_key:
            chosen = "fal"
        else:
            return ImageResult(url="", prompt=prompt, cost=0.0, backend="skipped")

    if chosen == "openai":
        return await _openai(prompt)
    if chosen == "fal":
        return await _fal(prompt)
    return ImageResult(url="", prompt=prompt, cost=0.0, backend="skipped")


async def _openai(prompt: str) -> ImageResult:
    api_key = get_settings().openai_api_key
    if not api_key:
        raise RuntimeError("openai key not configured")
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            OPENAI_IMAGES_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "gpt-image-1",
                "prompt": prompt,
                "size": "1024x1024",
                "n": 1,
            },
        )
        resp.raise_for_status()
        data = resp.json().get("data") or []
    if not data:
        return ImageResult(url="", prompt=prompt, cost=0.0, backend="openai")
    item = data[0]
    # gpt-image-1 returns either url or b64_json depending on options
    url = item.get("url") or ""
    if not url and item.get("b64_json"):
        # Caller can adapt; for now we don't proxy b64 data via API
        url = f"data:image/png;base64,{item['b64_json']}"
    return ImageResult(url=url, prompt=prompt, cost=OPENAI_COST, backend="openai")


async def _fal(prompt: str) -> ImageResult:
    api_key = get_settings().fal_api_key
    if not api_key:
        raise RuntimeError("fal key not configured")
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            FAL_URL,
            headers={"Authorization": f"Key {api_key}"},
            json={
                "prompt": prompt,
                "image_size": "landscape_16_9",
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
                "num_images": 1,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    images = data.get("images") or []
    url = images[0].get("url") if images else ""
    return ImageResult(url=url, prompt=prompt, cost=FAL_COST, backend="fal")
