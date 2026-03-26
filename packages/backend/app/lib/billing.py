"""Billing helpers — cost calculation and ledger writes."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import CreditLedger


def get_inference_cost_per_token(tokens_per_sec: float = 30.0) -> Decimal:
    """Cost per token based on electricity rate and GPU wattage.

    Formula: (GPU_INFERENCE_WATTS + SYSTEM_WATTS) / 1000 * ELECTRICITY_RATE_KWH / 3600 / tokens_per_sec
    """
    s = get_settings()
    watts = s.GPU_INFERENCE_WATTS + s.SYSTEM_WATTS
    kwh_per_second = watts / 1000 / 3600
    cost_per_second = kwh_per_second * s.ELECTRICITY_RATE_KWH
    cost_per_token = cost_per_second / tokens_per_sec
    return Decimal(str(cost_per_token))


def get_render_cost_per_minute() -> Decimal:
    """Cost per render-minute based on electricity rate and GPU wattage.

    Formula: (GPU_RENDER_WATTS + SYSTEM_WATTS) / 1000 * ELECTRICITY_RATE_KWH / 60
    """
    s = get_settings()
    watts = s.GPU_RENDER_WATTS + s.SYSTEM_WATTS
    cost_per_minute = (watts / 1000) * s.ELECTRICITY_RATE_KWH / 60
    return Decimal(str(cost_per_minute))


def calculate_inference_cost(
    input_tokens: int,
    output_tokens: int,
    tokens_per_sec: float = 30.0,
) -> tuple[Decimal, Decimal]:
    """Return (cost_nzd, kwh) for an inference request."""
    s = get_settings()
    total_tokens = input_tokens + output_tokens
    cost_per_token = get_inference_cost_per_token(tokens_per_sec)
    cost = cost_per_token * total_tokens

    # Calculate actual kWh consumed
    watts = s.GPU_INFERENCE_WATTS + s.SYSTEM_WATTS
    seconds = total_tokens / tokens_per_sec
    kwh = Decimal(str(watts / 1000 * seconds / 3600))

    return cost, kwh


def calculate_render_cost(render_seconds: float) -> tuple[Decimal, Decimal]:
    """Return (cost_nzd, kwh) for a render job."""
    s = get_settings()
    minutes = Decimal(str(render_seconds)) / 60
    cost = get_render_cost_per_minute() * minutes

    watts = s.GPU_RENDER_WATTS + s.SYSTEM_WATTS
    kwh = Decimal(str(watts / 1000 * render_seconds / 3600))

    return cost, kwh


async def get_balance(db: AsyncSession, user_id: UUID) -> Decimal:
    """Get user's current balance as SUM of credit_ledger."""
    result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user_id
        )
    )
    return result.scalar_one()


async def get_this_month_usage(db: AsyncSession, user_id: UUID) -> Decimal:
    """Get total usage cost for the current calendar month."""
    now = datetime.utcnow()
    result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.user_id == user_id,
            CreditLedger.type.in_(
                ["inference_usage", "cloud_inference_usage", "render_usage"]
            ),
            extract("month", CreditLedger.created_at) == now.month,
            extract("year", CreditLedger.created_at) == now.year,
        )
    )
    # Usage entries are negative; return the absolute value.
    return abs(result.scalar_one())


async def write_ledger_entry(
    db: AsyncSession,
    user_id: UUID,
    amount: Decimal,
    entry_type: str,
    description: str | None = None,
    stripe_id: str | None = None,
) -> CreditLedger:
    """Append a row to the credit ledger (append-only — never update)."""
    entry = CreditLedger(
        user_id=user_id,
        amount=amount,
        type=entry_type,
        description=description,
        stripe_id=stripe_id,
    )
    db.add(entry)
    await db.flush()
    return entry


async def check_balance_ok(
    db: AsyncSession, user_id: UUID, hard_limit: Decimal
) -> bool:
    """Return True if user balance is above their hard limit."""
    balance = await get_balance(db, user_id)
    return balance >= hard_limit
