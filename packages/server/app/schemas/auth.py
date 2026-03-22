"""Authentication and user schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str | None = None
    bootstrap_token: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str | None
    status: str
    role: str
    billing_type: str
    hard_limit_nzd: float
    services_enabled: list[str]
    created_at: datetime


class ApiKeyCreateRequest(BaseModel):
    label: str | None = None


class ApiKeyCreateResponse(BaseModel):
    """Returned once when the key is created — `key` is the raw secret."""

    key: str
    id: UUID
    label: str | None
    created_at: datetime


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str | None
    last_used: datetime | None
    created_at: datetime
    revoked_at: datetime | None
