"""OpenAI-compatible inference schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ContentPart(BaseModel):
    type: str
    text: str | None = None
    image_url: dict | None = None


class ChatMessage(BaseModel):
    role: str
    content: str | list[ContentPart]


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None


class ChatCompletionChoice(BaseModel):
    index: int
    message: ChatMessage
    finish_reason: str | None


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatCompletionResponse(BaseModel):
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


class ModelsResponse(BaseModel):
    object: str = "list"
    data: list[ModelInfo]
