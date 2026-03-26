"""Ollama HTTP client with streaming and token counting."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import httpx
import tiktoken

from app.config import get_settings


def count_tokens(text: str) -> int:
    """Approximate token count using tiktoken cl100k_base encoding."""
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


async def list_models() -> list[str]:
    """Return list of model names currently loaded/available in Ollama."""
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.OLLAMA_HOST}/api/tags")
        resp.raise_for_status()
        data = resp.json()
        return [m["name"] for m in data.get("models", [])]


async def list_running_models() -> list[str]:
    """Return list of model names currently loaded in VRAM (from /api/ps)."""
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{settings.OLLAMA_HOST}/api/ps")
        resp.raise_for_status()
        data = resp.json()
        return [m["name"] for m in data.get("models", [])]


async def get_local_models() -> list[str]:
    """Get all locally available Ollama models sorted by parameter size (smallest first).

    Returns an empty list if Ollama is unavailable.
    """
    import re

    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{settings.OLLAMA_HOST}/api/tags")
            if resp.status_code != 200:
                return []
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]

            def _param_size(name: str) -> float:
                """Extract parameter size from model name for sorting."""
                match = re.search(r"(\d+(?:\.\d+)?)\s*[bB]", name)
                return float(match.group(1)) if match else 0.0

            return sorted(models, key=_param_size)
    except Exception:
        return []


async def chat_completion(
    model: str,
    messages: list[dict],
    stream: bool = False,
    temperature: float | None = None,
    max_tokens: int | None = None,
    tools: list[dict] | None = None,
) -> dict:
    """Non-streaming chat completion. Returns Ollama response dict."""
    settings = get_settings()
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "keep_alive": settings.OLLAMA_KEEP_ALIVE,
    }
    if tools:
        payload["tools"] = tools
    options = {}
    if temperature is not None:
        options["temperature"] = temperature
    if max_tokens is not None:
        options["num_predict"] = max_tokens
    if options:
        payload["options"] = options

    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(f"{settings.OLLAMA_HOST}/api/chat", json=payload)
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("error", resp.text)
            except Exception:
                detail = resp.text
            raise RuntimeError(f"Ollama error: {detail}")
        return resp.json()


async def chat_completion_stream(
    model: str,
    messages: list[dict],
    temperature: float | None = None,
    max_tokens: int | None = None,
    tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    """Streaming chat completion. Yields Ollama response chunks."""
    settings = get_settings()
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "keep_alive": settings.OLLAMA_KEEP_ALIVE,
    }
    if tools:
        payload["tools"] = tools
    options = {}
    if temperature is not None:
        options["temperature"] = temperature
    if max_tokens is not None:
        options["num_predict"] = max_tokens
    if options:
        payload["options"] = options

    async with httpx.AsyncClient(timeout=300.0) as client:
        async with client.stream(
            "POST", f"{settings.OLLAMA_HOST}/api/chat", json=payload
        ) as resp:
            if resp.status_code >= 400:
                # Read the body to get Ollama's error message before raising
                body = await resp.aread()
                try:
                    detail = json.loads(body).get("error", body.decode())
                except Exception:
                    detail = body.decode()
                raise RuntimeError(f"Ollama error: {detail}")
            async for line in resp.aiter_lines():
                if line.strip():
                    chunk = json.loads(line)
                    # Ollama can return an error mid-stream
                    if "error" in chunk:
                        raise RuntimeError(f"Ollama error: {chunk['error']}")
                    yield chunk
