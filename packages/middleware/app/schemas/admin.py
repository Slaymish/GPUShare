"""Admin-only schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .auth import UserResponse


class AdminUserResponse(UserResponse):
    """UserResponse extended with balance information."""

    model_config = ConfigDict(from_attributes=True)

    balance_nzd: float
    monthly_usage_nzd: float


class UserUpdateRequest(BaseModel):
    status: str | None = None
    role: str | None = None
    hard_limit_nzd: float | None = None
    services_enabled: list[str] | None = None


class AdjustBalanceRequest(BaseModel):
    amount_nzd: float
    description: str


class SystemStatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_inference_cost_nzd: float
    total_render_cost_nzd: float
    total_balance_nzd: float
    jobs_in_queue: int
