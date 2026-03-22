"""OpenRouter API client for cloud model access."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"


def is_openrouter_model(model: str) -> bool:
    """Return True if this model should be routed to OpenRouter (contains a /)."""
    return "/" in model


async def chat_completion(
    model: str,
    messages: list[dict],
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    """Non-streaming chat completion via OpenRouter. Returns OpenAI-format response."""
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/gpu-node",
    }
    payload: dict = {
        "model": model,
        "messages": messages,
        "stream": False,
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{OPENROUTER_BASE}/chat/completions", json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def chat_completion_stream(
    model: str,
    messages: list[dict],
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> AsyncGenerator[dict, None]:
    """Streaming chat completion via OpenRouter. Yields OpenAI-format SSE chunks."""
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/gpu-node",
    }
    payload: dict = {
        "model": model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", f"{OPENROUTER_BASE}/chat/completions", json=payload, headers=headers) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    return
                try:
                    yield json.loads(data)
                except json.JSONDecodeError:
                    continue


# Cache of model pricing fetched from OpenRouter
_pricing_cache: dict[str, tuple[float, float]] = {}


async def _get_model_pricing(model: str) -> tuple[float, float]:
    """Return (prompt_rate, completion_rate) per token for an OpenRouter model.

    Fetches pricing from the OpenRouter API on cache miss so that inference
    requests are never silently billed at $0.
    """
    if model in _pricing_cache:
        return _pricing_cache[model]

    # Cache miss — fetch all model pricing from OpenRouter
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OPENROUTER_BASE}/models")
            resp.raise_for_status()
            for m in resp.json().get("data", []):
                pricing = m.get("pricing", {})
                _pricing_cache[m["id"]] = (
                    float(pricing.get("prompt", "0")),
                    float(pricing.get("completion", "0")),
                )
    except Exception:
        logger.warning("Failed to fetch OpenRouter model pricing for %s", model, exc_info=True)

    rates = _pricing_cache.get(model, (0.0, 0.0))
    if rates == (0.0, 0.0):
        logger.warning(
            "OpenRouter pricing for model %s is $0 — usage will not be billed. "
            "Check that the model ID matches OpenRouter's catalog.",
            model,
        )
    return rates


async def list_models() -> list[dict]:
    """Fetch available models from OpenRouter with pricing info."""
    settings = get_settings()
    if not settings.OPENROUTER_API_KEY:
        return []

    # Only return models the admin has configured
    configured = settings.openrouter_models_list
    if not configured:
        return []

    # Fetch pricing from OpenRouter
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OPENROUTER_BASE}/models")
            resp.raise_for_status()
            all_models = resp.json().get("data", [])
    except Exception:
        # If we can't fetch pricing, return models with zero cost (will be billed at actual)
        return [{"id": m, "pricing": {"prompt": "0", "completion": "0"}} for m in configured]

    # Filter to configured models and cache pricing
    model_map = {m["id"]: m for m in all_models}
    result = []
    for model_id in configured:
        if model_id in model_map:
            m = model_map[model_id]
            result.append(m)
        else:
            m = {"id": model_id, "pricing": {"prompt": "0", "completion": "0"}}
            result.append(m)
        # Cache pricing for cost calculation
        pricing = m.get("pricing", {})
        _pricing_cache[model_id] = (
            float(pricing.get("prompt", "0")),
            float(pricing.get("completion", "0")),
        )
    return result
