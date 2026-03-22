"""Billing, usage, and invoice schemas."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BalanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    balance_nzd: float
    this_month_usage_nzd: float
    hard_limit_nzd: float
    billing_type: str
    total_topped_up_nzd: float
    total_used_nzd: float


class UsageLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    model: str
    input_tokens: int
    output_tokens: int
    cost_nzd: float
    kwh: float
    created_at: datetime


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    period_start: date
    period_end: date
    amount_nzd: float
    status: str
    created_at: datetime
    paid_at: datetime | None


class TopUpRequest(BaseModel):
    amount_nzd: float = Field(..., gt=0)


class TopUpResponse(BaseModel):
    checkout_url: str


class SetupIntentResponse(BaseModel):
    client_secret: str


class PaymentMethodResponse(BaseModel):
    id: str
    card_brand: str
    card_last4: str
    card_exp_month: int
    card_exp_year: int
