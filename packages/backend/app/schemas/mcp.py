"""MCP (Model Context Protocol) server management schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class McpServerCreate(BaseModel):
    name: str
    transport: str  # "stdio" or "sse"
    command: str | None = None  # for stdio: e.g. "python"
    args: list[str] | None = None  # for stdio: e.g. ["-m", "trademe_mcp.server"]
    url: str | None = None  # for sse: the SSE endpoint URL
    env: dict[str, str] | None = None  # environment variables
    enabled: bool = True


class McpServerUpdate(BaseModel):
    name: str | None = None
    transport: str | None = None
    command: str | None = None
    args: list[str] | None = None
    url: str | None = None
    env: dict[str, str] | None = None
    enabled: bool | None = None


class McpServerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    transport: str
    command: str | None = None
    args: list[str] | None = None
    url: str | None = None
    env: dict[str, str] | None = None
    enabled: bool
    status: str  # "disconnected", "connecting", "connected", "error"
    error_message: str | None = None
    tool_count: int = 0
    created_at: str


class McpToolInfo(BaseModel):
    server_id: str
    server_name: str
    name: str
    description: str | None = None
    parameters: dict[str, Any] | None = None


class McpToolsResponse(BaseModel):
    tools: list[McpToolInfo]


class McpToolCallRequest(BaseModel):
    server_id: str
    tool_name: str
    arguments: dict[str, Any] = {}


class McpToolCallResponse(BaseModel):
    result: Any
    is_error: bool = False
