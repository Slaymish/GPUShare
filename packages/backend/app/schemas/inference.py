"""OpenAI-compatible inference schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ContentPart(BaseModel):
    type: str
    text: str | None = None
    image_url: dict | None = None


class ToolCallFunction(BaseModel):
    name: str
    arguments: str  # JSON-encoded string


class ToolCall(BaseModel):
    id: str
    type: str = "function"
    function: ToolCallFunction


class ChatMessage(BaseModel):
    role: str
    content: list[ContentPart] | str | None = None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None
    name: str | None = None


class FunctionDefinition(BaseModel):
    name: str
    description: str | None = None
    parameters: dict[str, Any] | None = None


class ToolDefinition(BaseModel):
    type: str = "function"
    function: FunctionDefinition


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    tools: list[ToolDefinition] | None = None
    tool_choice: str | dict | None = None


class ChatCompletionChoice(BaseModel):
    index: int
    message: ChatMessage
    finish_reason: str | None


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletionResponse(BaseModel):
    model_config = ConfigDict(exclude_none=True)

    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[ChatCompletionChoice]
    usage: UsageInfo


class ModelInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    object: str = "model"
    owned_by: str = "local"
    cost_per_million_tokens: float
    loaded: bool = False
    vision_support: bool = False


class ModelsResponse(BaseModel):
    object: str = "list"
    data: list[ModelInfo]
