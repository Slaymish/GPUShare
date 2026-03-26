"""Pydantic request/response schemas for the GPUShare API."""

from __future__ import annotations

from .admin import (
    AdminUserResponse,
    AdjustBalanceRequest,
    SystemStatsResponse,
    UserUpdateRequest,
)
from .auth import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyResponse,
    LoginRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)
from .billing import (
    BalanceResponse,
    InvoiceResponse,
    TopUpRequest,
    TopUpResponse,
    UsageLogResponse,
)
from .inference import (
    ChatCompletionChoice,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    ModelInfo,
    ModelsResponse,
    UsageInfo,
)
from .render import RenderJobCreateRequest, RenderJobResponse

__all__ = [
    # auth
    "SignupRequest",
    "LoginRequest",
    "TokenResponse",
    "UserResponse",
    "ApiKeyCreateRequest",
    "ApiKeyCreateResponse",
    "ApiKeyResponse",
    # billing
    "BalanceResponse",
    "UsageLogResponse",
    "InvoiceResponse",
    "TopUpRequest",
    "TopUpResponse",
    # inference
    "ChatMessage",
    "ChatCompletionRequest",
    "ChatCompletionChoice",
    "UsageInfo",
    "ChatCompletionResponse",
    "ModelInfo",
    "ModelsResponse",
    # render
    "RenderJobCreateRequest",
    "RenderJobResponse",
    # admin
    "AdminUserResponse",
    "UserUpdateRequest",
    "AdjustBalanceRequest",
    "SystemStatsResponse",
]
