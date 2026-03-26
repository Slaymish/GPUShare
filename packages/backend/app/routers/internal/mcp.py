"""Internal MCP server management endpoints.

CRUD for MCP server configs, tool discovery, and tool execution.
Accepts X-User-Id header (trusted from middleware).
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.lib.mcp_client import (
    McpServerConfig,
    call_tool,
    connect_server,
    disconnect_server,
    get_connection_status,
    list_tools,
)
from app.models import McpServer, User
from app.schemas.mcp import (
    McpServerCreate,
    McpServerResponse,
    McpServerUpdate,
    McpToolCallRequest,
    McpToolCallResponse,
    McpToolInfo,
    McpToolsResponse,
)

router = APIRouter(prefix="/internal/mcp", tags=["internal-mcp"])


def _server_to_config(server: McpServer) -> McpServerConfig:
    return McpServerConfig(
        id=str(server.id),
        name=server.name,
        transport=server.transport,
        command=server.command,
        args=json.loads(server.args_json) if server.args_json else None,
        url=server.url,
        env=json.loads(server.env_json) if server.env_json else None,
    )


def _server_to_response(server: McpServer, user_id: str) -> dict:
    status = get_connection_status(user_id, str(server.id))
    return {
        "id": str(server.id),
        "name": server.name,
        "transport": server.transport,
        "command": server.command,
        "args": json.loads(server.args_json) if server.args_json else None,
        "url": server.url,
        "env": json.loads(server.env_json) if server.env_json else None,
        "enabled": server.enabled,
        "status": status,
        "error_message": None,
        "tool_count": 0,
        "created_at": server.created_at.isoformat() if server.created_at else "",
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("/servers")
async def list_servers(
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> list[McpServerResponse]:
    user_id = uuid.UUID(x_user_id)
    result = await db.execute(
        select(McpServer).where(McpServer.user_id == user_id)
    )
    servers = result.scalars().all()
    responses = []
    for s in servers:
        resp = _server_to_response(s, x_user_id)
        # If connected, get tool count
        if resp["status"] == "connected":
            try:
                tools = await list_tools(x_user_id, _server_to_config(s))
                resp["tool_count"] = len(tools)
            except Exception:
                pass
        responses.append(McpServerResponse(**resp))
    return responses


@router.post("/servers")
async def create_server(
    body: McpServerCreate,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> McpServerResponse:
    user_id = uuid.UUID(x_user_id)

    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="User not found")

    server = McpServer(
        user_id=user_id,
        name=body.name,
        transport=body.transport,
        command=body.command,
        args_json=json.dumps(body.args) if body.args else None,
        url=body.url,
        env_json=json.dumps(body.env) if body.env else None,
        enabled=body.enabled,
    )
    db.add(server)
    await db.flush()

    return McpServerResponse(**_server_to_response(server, x_user_id))


@router.patch("/servers/{server_id}")
async def update_server(
    server_id: str,
    body: McpServerUpdate,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> McpServerResponse:
    user_id = uuid.UUID(x_user_id)
    sid = uuid.UUID(server_id)

    result = await db.execute(
        select(McpServer).where(McpServer.id == sid, McpServer.user_id == user_id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP server not found")

    if body.name is not None:
        server.name = body.name
    if body.transport is not None:
        server.transport = body.transport
    if body.command is not None:
        server.command = body.command
    if body.args is not None:
        server.args_json = json.dumps(body.args)
    if body.url is not None:
        server.url = body.url
    if body.env is not None:
        server.env_json = json.dumps(body.env)
    if body.enabled is not None:
        server.enabled = body.enabled

    # Disconnect if config changed so it reconnects with new settings
    await disconnect_server(x_user_id, server_id)

    return McpServerResponse(**_server_to_response(server, x_user_id))


@router.delete("/servers/{server_id}")
async def delete_server(
    server_id: str,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user_id = uuid.UUID(x_user_id)
    sid = uuid.UUID(server_id)

    result = await db.execute(
        select(McpServer).where(McpServer.id == sid, McpServer.user_id == user_id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP server not found")

    await disconnect_server(x_user_id, server_id)
    await db.delete(server)

    return {"ok": True}


# ---------------------------------------------------------------------------
# Tool discovery & execution
# ---------------------------------------------------------------------------


@router.get("/tools")
async def get_all_tools(
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> McpToolsResponse:
    """List tools from all enabled & connected MCP servers for this user."""
    user_id = uuid.UUID(x_user_id)
    result = await db.execute(
        select(McpServer).where(
            McpServer.user_id == user_id, McpServer.enabled == True
        )
    )
    servers = result.scalars().all()

    all_tools: list[McpToolInfo] = []
    for server in servers:
        config = _server_to_config(server)
        try:
            tools = await list_tools(x_user_id, config)
            for tool in tools:
                all_tools.append(
                    McpToolInfo(
                        server_id=str(server.id),
                        server_name=server.name,
                        name=tool["name"],
                        description=tool.get("description"),
                        parameters=tool.get("parameters"),
                    )
                )
        except Exception as exc:
            # Server failed to connect — skip it
            pass

    return McpToolsResponse(tools=all_tools)


@router.post("/tools/call")
async def call_mcp_tool(
    body: McpToolCallRequest,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> McpToolCallResponse:
    """Execute a tool on a specific MCP server."""
    user_id = uuid.UUID(x_user_id)
    sid = uuid.UUID(body.server_id)

    result = await db.execute(
        select(McpServer).where(McpServer.id == sid, McpServer.user_id == user_id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP server not found")

    config = _server_to_config(server)
    tool_result = await call_tool(x_user_id, config, body.tool_name, body.arguments)

    return McpToolCallResponse(**tool_result)


@router.post("/servers/{server_id}/connect")
async def connect_mcp_server(
    server_id: str,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> McpServerResponse:
    """Manually trigger a connection to an MCP server."""
    user_id = uuid.UUID(x_user_id)
    sid = uuid.UUID(server_id)

    result = await db.execute(
        select(McpServer).where(McpServer.id == sid, McpServer.user_id == user_id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP server not found")

    config = _server_to_config(server)
    resp = _server_to_response(server, x_user_id)

    try:
        conn = await connect_server(x_user_id, config)
        resp["status"] = "connected"
        resp["tool_count"] = len(conn.tools)
    except Exception as exc:
        resp["status"] = "error"
        resp["error_message"] = str(exc)

    return McpServerResponse(**resp)


@router.post("/servers/{server_id}/disconnect")
async def disconnect_mcp_server(
    server_id: str,
    x_user_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> McpServerResponse:
    """Disconnect from an MCP server."""
    user_id = uuid.UUID(x_user_id)
    sid = uuid.UUID(server_id)

    result = await db.execute(
        select(McpServer).where(McpServer.id == sid, McpServer.user_id == user_id)
    )
    server = result.scalar_one_or_none()
    if server is None:
        raise HTTPException(status_code=404, detail="MCP server not found")

    await disconnect_server(x_user_id, server_id)

    return McpServerResponse(**_server_to_response(server, x_user_id))
