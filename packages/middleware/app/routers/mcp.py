"""MCP server management router — proxies to backend for MCP operations.

Provides user-facing endpoints for configuring MCP servers, listing tools,
and executing tool calls.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.backend_client import backend_post, _make_internal_headers, get_backend_client
from app.models import User

router = APIRouter(prefix="/v1/mcp", tags=["mcp"])


# ---------------------------------------------------------------------------
# Server CRUD
# ---------------------------------------------------------------------------


@router.get("/servers")
async def list_servers(user: User = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        headers = _make_internal_headers(user_id=str(user.id))
        async with get_backend_client() as client:
            resp = await client.get("/internal/mcp/servers", headers=headers)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


@router.post("/servers")
async def create_server(body: dict, user: User = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        resp = await backend_post(
            "/internal/mcp/servers",
            user_id=str(user.id),
            json=body,
        )
        return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


@router.patch("/servers/{server_id}")
async def update_server(server_id: str, body: dict, user: User = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        headers = _make_internal_headers(user_id=str(user.id))
        async with get_backend_client() as client:
            resp = await client.patch(
                f"/internal/mcp/servers/{server_id}",
                json=body,
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


@router.delete("/servers/{server_id}")
async def delete_server(server_id: str, user: User = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        headers = _make_internal_headers(user_id=str(user.id))
        async with get_backend_client() as client:
            resp = await client.delete(
                f"/internal/mcp/servers/{server_id}",
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------


@router.post("/servers/{server_id}/connect")
async def connect_server(server_id: str, user: User = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        resp = await backend_post(
            f"/internal/mcp/servers/{server_id}/connect",
            user_id=str(user.id),
        )
        return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


@router.post("/servers/{server_id}/disconnect")
async def disconnect_server(server_id: str, user: User = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        resp = await backend_post(
            f"/internal/mcp/servers/{server_id}/disconnect",
            user_id=str(user.id),
        )
        return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@router.get("/tools")
async def list_tools(user: User = Depends(get_current_user)):
    """List all tools from enabled MCP servers for the current user."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        headers = _make_internal_headers(user_id=str(user.id))
        async with get_backend_client() as client:
            resp = await client.get("/internal/mcp/tools", headers=headers)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")


@router.post("/tools/call")
async def call_tool(body: dict, user: User = Depends(get_current_user)):
    """Execute a tool on a specific MCP server."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        resp = await backend_post(
            "/internal/mcp/tools/call",
            user_id=str(user.id),
            json=body,
        )
        return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")
