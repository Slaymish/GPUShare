"""Status and health endpoints — cached proxies to backend."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.backend_client import backend_get
from app.cache import cache

router = APIRouter(tags=["status"])

HEALTH_CACHE_TTL = 15.0
STATUS_CACHE_TTL = 15.0


@router.get("/health")
async def health():
    """Return server health (cached 15s)."""
    cached = cache.get("health", HEALTH_CACHE_TTL)
    if cached is not None:
        return cached

    try:
        resp = await backend_get("/internal/health")
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")

    cache.set("health", data)
    return data


@router.get("/v1/status")
async def get_status():
    """Return GPU status (cached 15s)."""
    cached = cache.get("status", STATUS_CACHE_TTL)
    if cached is not None:
        return cached

    try:
        resp = await backend_get("/internal/status")
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")

    cache.set("status", data)
    return data
