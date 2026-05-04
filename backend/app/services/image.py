"""Fal.ai Flux Pro image generation. Cost ~$0.03/image."""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import get_settings

FAL_URL = "https://fal.run/fal-ai/flux-pro"
COST = 0.03


@dataclass
class ImageResult:
    url: str
    prompt: str
    cost: float


async def generate_image(prompt: str) -> ImageResult:
    if get_settings().mock_external or not get_settings().fal_api_key:
        return ImageResult(
            url="https://placehold.co/1024x576/png?text=Mock+Image",
            prompt=prompt,
            cost=0.0,
        )

    headers = {"Authorization": f"Key {get_settings().fal_api_key}"}
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            FAL_URL,
            headers=headers,
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
    return ImageResult(url=url, prompt=prompt, cost=COST)
