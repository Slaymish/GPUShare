"""MCP client manager — connects to MCP servers and executes tools.

Supports stdio and SSE transports. Maintains a connection pool keyed
by (user_id, server_id) so tools can be listed and called efficiently.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client

logger = logging.getLogger(__name__)


@dataclass
class McpConnection:
    """A live connection to an MCP server."""

    session: ClientSession
    tools: list[dict[str, Any]] = field(default_factory=list)
    _cleanup: Any = None  # context manager exit


@dataclass
class McpServerConfig:
    """Lightweight config for connecting to an MCP server."""

    id: str
    name: str
    transport: str  # "stdio" or "sse"
    command: str | None = None
    args: list[str] | None = None
    url: str | None = None
    env: dict[str, str] | None = None


# Module-level connection cache: (user_id, server_id) -> McpConnection
_connections: dict[tuple[str, str], McpConnection] = {}
_connection_locks: dict[tuple[str, str], asyncio.Lock] = {}


def _get_lock(key: tuple[str, str]) -> asyncio.Lock:
    if key not in _connection_locks:
        _connection_locks[key] = asyncio.Lock()
    return _connection_locks[key]


async def connect_server(user_id: str, config: McpServerConfig) -> McpConnection:
    """Connect to an MCP server and discover its tools.

    Returns a cached connection if one already exists.
    """
    key = (user_id, config.id)
    lock = _get_lock(key)

    async with lock:
        if key in _connections:
            return _connections[key]

        try:
            if config.transport == "stdio":
                conn = await _connect_stdio(config)
            elif config.transport == "sse":
                conn = await _connect_sse(config)
            else:
                raise ValueError(f"Unknown transport: {config.transport}")

            # Discover tools
            tools_result = await conn.session.list_tools()
            conn.tools = [
                {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.inputSchema if hasattr(tool, "inputSchema") else None,
                }
                for tool in tools_result.tools
            ]

            _connections[key] = conn
            logger.info(
                "Connected to MCP server %s (%s), discovered %d tools",
                config.name,
                config.transport,
                len(conn.tools),
            )
            return conn

        except Exception as exc:
            logger.error("Failed to connect to MCP server %s: %s", config.name, exc)
            raise


async def _connect_stdio(config: McpServerConfig) -> McpConnection:
    """Connect via stdio transport."""
    if not config.command:
        raise ValueError("stdio transport requires a command")

    env = {**os.environ}
    if config.env:
        env.update(config.env)

    server_params = StdioServerParameters(
        command=config.command,
        args=config.args or [],
        env=env,
    )

    # Start the stdio client as a background task
    read_stream, write_stream = await _start_stdio_process(server_params)
    session = ClientSession(read_stream, write_stream)
    await session.initialize()

    return McpConnection(session=session)


async def _start_stdio_process(params: StdioServerParameters):
    """Start an MCP stdio server process and return read/write streams."""
    # Use the mcp library's stdio_client as an async context manager
    # We need to manage the lifecycle manually for long-lived connections
    from contextlib import AsyncExitStack

    stack = AsyncExitStack()

    stdio_transport = await stack.enter_async_context(
        stdio_client(params)
    )
    read_stream, write_stream = stdio_transport

    return read_stream, write_stream


async def _connect_sse(config: McpServerConfig) -> McpConnection:
    """Connect via SSE transport."""
    if not config.url:
        raise ValueError("SSE transport requires a url")

    from contextlib import AsyncExitStack

    stack = AsyncExitStack()

    sse_transport = await stack.enter_async_context(
        sse_client(config.url)
    )
    read_stream, write_stream = sse_transport

    session = ClientSession(read_stream, write_stream)
    await session.initialize()

    return McpConnection(session=session)


async def list_tools(user_id: str, config: McpServerConfig) -> list[dict[str, Any]]:
    """List tools available from an MCP server."""
    conn = await connect_server(user_id, config)
    return conn.tools


async def call_tool(
    user_id: str,
    config: McpServerConfig,
    tool_name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Call a tool on an MCP server and return the result."""
    conn = await connect_server(user_id, config)

    try:
        result = await conn.session.call_tool(tool_name, arguments)

        # Extract text content from the result
        content_parts = []
        is_error = result.isError if hasattr(result, "isError") else False

        for part in result.content:
            if hasattr(part, "text"):
                content_parts.append(part.text)
            elif hasattr(part, "data"):
                content_parts.append(f"[Binary data: {part.mimeType}]")
            else:
                content_parts.append(str(part))

        return {
            "result": "\n".join(content_parts) if content_parts else "",
            "is_error": is_error,
        }

    except Exception as exc:
        logger.error("Tool call failed on %s/%s: %s", config.name, tool_name, exc)
        # Invalidate the connection on error so it reconnects next time
        key = (user_id, config.id)
        _connections.pop(key, None)
        return {
            "result": f"Tool execution error: {exc}",
            "is_error": True,
        }


async def disconnect_server(user_id: str, server_id: str) -> None:
    """Disconnect from an MCP server and clean up resources."""
    key = (user_id, server_id)
    conn = _connections.pop(key, None)
    if conn and conn._cleanup:
        try:
            await conn._cleanup()
        except Exception:
            pass


async def disconnect_all_for_user(user_id: str) -> None:
    """Disconnect all MCP servers for a user."""
    keys_to_remove = [k for k in _connections if k[0] == user_id]
    for key in keys_to_remove:
        conn = _connections.pop(key, None)
        if conn and conn._cleanup:
            try:
                await conn._cleanup()
            except Exception:
                pass


def get_connection_status(user_id: str, server_id: str) -> str:
    """Get the connection status of an MCP server."""
    key = (user_id, server_id)
    if key in _connections:
        return "connected"
    return "disconnected"
