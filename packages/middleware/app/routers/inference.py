"""Inference router — proxies to backend for actual inference.

GET /v1/inference/models is cached here (30s TTL).
POST /v1/inference/chat/completions is proxied to backend via SSE stream.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.auth.dependencies import get_current_user
from app.backend_client import get_backend_client, _make_internal_headers
from app.cache import cache
from app.config import get_settings
from app.models import User
from app.schemas.inference import ChatCompletionRequest, ModelsResponse

router = APIRouter(prefix="/v1/inference", tags=["inference"])

MODELS_CACHE_TTL = 30.0  # seconds


@router.get("/models", response_model=ModelsResponse)
async def list_models(user: User | None = Depends(get_current_user)):
    """Return available models (cached 30s)."""
    cached = cache.get("inference_models", MODELS_CACHE_TTL)
    if cached is not None:
        return cached

    try:
        settings = get_settings()
        headers = _make_internal_headers()
        async with get_backend_client() as client:
            resp = await client.get("/internal/inference/models", headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")

    result = ModelsResponse(**data)
    cache.set("inference_models", result)
    return result


@router.post("/chat/completions")
async def create_chat_completion(
    body: ChatCompletionRequest,
    user: User = Depends(get_current_user),
):
    """Proxy chat completion to the backend. Supports streaming SSE."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    headers = _make_internal_headers(user_id=str(user.id))
    body_dict = body.model_dump(exclude_none=True)

    if body.stream:
        async def event_stream():
            try:
                async with get_backend_client() as client:
                    async with client.stream(
                        "POST",
                        "/internal/inference/chat",
                        json=body_dict,
                        headers=headers,
                        timeout=httpx.Timeout(300.0, connect=10.0),
                    ) as resp:
                        resp.raise_for_status()
                        async for chunk in resp.aiter_bytes(chunk_size=None):
                            yield chunk
            except Exception as exc:
                import json
                yield f"data: {json.dumps({'error': str(exc)})}\n\n".encode()
                yield b"data: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    # Non-streaming
    try:
        async with get_backend_client() as client:
            resp = await client.post(
                "/internal/inference/chat",
                json=body_dict,
                headers=headers,
                timeout=httpx.Timeout(120.0, connect=10.0),
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")
