"""HTTP client for calling the backend internal API.

The middleware uses this client to proxy hardware operations (inference,
render, health checks) to the backend service.
"""

from __future__ import annotations

from functools import lru_cache

import httpx

from app.config import get_settings


def _make_internal_headers(user_id: str | None = None) -> dict[str, str]:
    """Build headers required by all backend internal requests."""
    settings = get_settings()
    headers = {"X-Internal-Token": settings.INTERNAL_SECRET}
    if user_id is not None:
        headers["X-User-Id"] = user_id
    return headers


def get_backend_client() -> httpx.AsyncClient:
    """Return a configured async HTTP client for the backend."""
    settings = get_settings()
    return httpx.AsyncClient(
        base_url=settings.BACKEND_URL,
        timeout=httpx.Timeout(300.0, connect=10.0),
    )


async def backend_get(path: str, **kwargs) -> httpx.Response:
    """Make a GET request to the backend internal API."""
    headers = _make_internal_headers()
    async with get_backend_client() as client:
        resp = await client.get(path, headers=headers, **kwargs)
        resp.raise_for_status()
        return resp


async def backend_post(path: str, user_id: str | None = None, **kwargs) -> httpx.Response:
    """Make a POST request to the backend internal API."""
    headers = _make_internal_headers(user_id)
    async with get_backend_client() as client:
        resp = await client.post(path, headers=headers, **kwargs)
        resp.raise_for_status()
        return resp


async def backend_delete(path: str, user_id: str | None = None, **kwargs) -> httpx.Response:
    """Make a DELETE request to the backend internal API."""
    headers = _make_internal_headers(user_id)
    async with get_backend_client() as client:
        resp = await client.delete(path, headers=headers, **kwargs)
        resp.raise_for_status()
        return resp
