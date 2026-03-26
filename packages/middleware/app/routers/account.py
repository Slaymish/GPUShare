"""Aggregated account endpoint — returns all account page data in one request.

Replaces the 7+ separate calls the account page currently makes on mount.
Uses asyncio.gather for concurrent DB reads and backend calls.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.backend_client import _make_internal_headers, get_backend_client
from app.cache import cache
from app.database import get_db
from app.lib.billing import get_balance, get_this_month_usage
from app.models import ApiKey, CreditLedger, Invoice, UsageLog, User
from app.config import get_settings

router = APIRouter(tags=["account"])

HEALTH_CACHE_TTL = 15.0
MODELS_CACHE_TTL = 30.0


async def _get_health(headers: dict) -> dict:
    cached = cache.get("health", HEALTH_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        async with get_backend_client() as client:
            resp = await client.get("/internal/health", headers=headers, timeout=5.0)
            data = resp.json()
            cache.set("health", data)
            return data
    except Exception:
        return {}


async def _get_models(headers: dict) -> dict:
    cached = cache.get("inference_models", MODELS_CACHE_TTL)
    if cached is not None:
        return cached
    try:
        async with get_backend_client() as client:
            resp = await client.get("/internal/inference/models", headers=headers, timeout=5.0)
            data = resp.json()
            cache.set("inference_models", data)
            return data
    except Exception:
        return {"data": []}


async def _get_payment_methods(user: User, settings) -> list:
    if not settings.STRIPE_SECRET_KEY or not user.stripe_customer_id:
        return []
    try:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        pms = stripe.PaymentMethod.list(customer=user.stripe_customer_id, type="card")
        return [
            {
                "id": pm.id,
                "card_brand": pm.card.brand,
                "card_last4": pm.card.last4,
                "card_exp_month": pm.card.exp_month,
                "card_exp_year": pm.card.exp_year,
            }
            for pm in pms.data
        ]
    except Exception:
        return []


@router.get("/v1/account")
async def get_account_page(
    user: User | None = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all account page data in a single request.

    Concurrently fetches: user profile, balance, usage, invoices, API keys,
    payment methods, available models, and server health.
    """
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    settings = get_settings()
    internal_headers = _make_internal_headers()

    async def _get_balance_data():
        balance = await get_balance(db, user.id)
        month_usage = await get_this_month_usage(db, user.id)

        topped_up_result = await db.execute(
            select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
                CreditLedger.user_id == user.id, CreditLedger.amount > 0
            )
        )
        total_topped_up = float(topped_up_result.scalar_one())

        used_result = await db.execute(
            select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
                CreditLedger.user_id == user.id, CreditLedger.amount < 0
            )
        )
        total_used = abs(float(used_result.scalar_one()))

        inference_result = await db.execute(
            select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
                CreditLedger.user_id == user.id,
                CreditLedger.type.in_(["inference_usage", "cloud_inference_usage"]),
            )
        )
        total_inference_cost = abs(float(inference_result.scalar_one()))

        cloud_result = await db.execute(
            select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
                CreditLedger.user_id == user.id,
                CreditLedger.type == "cloud_inference_usage",
            )
        )
        total_cloud_cost = abs(float(cloud_result.scalar_one()))

        render_result = await db.execute(
            select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
                CreditLedger.user_id == user.id, CreditLedger.type == "render_usage"
            )
        )
        total_render_cost = abs(float(render_result.scalar_one()))

        return {
            "balance_nzd": float(balance),
            "this_month_usage_nzd": float(month_usage),
            "hard_limit_nzd": float(user.hard_limit_nzd),
            "billing_type": user.billing_type,
            "total_topped_up_nzd": total_topped_up,
            "total_used_nzd": total_used,
            "total_inference_cost_nzd": total_inference_cost,
            "total_cloud_inference_cost_nzd": total_cloud_cost,
            "total_render_cost_nzd": total_render_cost,
        }

    async def _get_usage_recent():
        result = await db.execute(
            select(UsageLog)
            .where(UsageLog.user_id == user.id)
            .order_by(UsageLog.created_at.desc())
            .limit(50)
        )
        rows = result.scalars().all()
        return [
            {
                "id": str(r.id),
                "model": r.model,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "cost_nzd": float(r.cost_nzd) if r.cost_nzd else 0.0,
                "kwh": float(r.kwh) if r.kwh else 0.0,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    async def _get_usage_all():
        result = await db.execute(
            select(UsageLog)
            .where(UsageLog.user_id == user.id)
            .order_by(UsageLog.created_at.desc())
            .limit(10000)
        )
        rows = result.scalars().all()
        return [
            {
                "id": str(r.id),
                "model": r.model,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "cost_nzd": float(r.cost_nzd) if r.cost_nzd else 0.0,
                "kwh": float(r.kwh) if r.kwh else 0.0,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    async def _get_invoices():
        result = await db.execute(
            select(Invoice).where(Invoice.user_id == user.id).order_by(Invoice.created_at.desc())
        )
        rows = result.scalars().all()
        return [
            {
                "id": str(r.id),
                "period_start": r.period_start.isoformat() if r.period_start else None,
                "period_end": r.period_end.isoformat() if r.period_end else None,
                "amount_nzd": float(r.amount_nzd),
                "stripe_invoice_id": r.stripe_invoice_id,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "paid_at": r.paid_at.isoformat() if r.paid_at else None,
            }
            for r in rows
        ]

    async def _get_api_keys():
        result = await db.execute(
            select(ApiKey)
            .where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at.desc())
        )
        rows = result.scalars().all()
        return [
            {
                "id": str(r.id),
                "label": r.label,
                "last_used": r.last_used.isoformat() if r.last_used else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]

    # Fetch everything concurrently
    (
        balance_data,
        usage_recent,
        usage_all,
        invoices,
        api_keys,
        payment_methods,
        models,
        health,
    ) = await asyncio.gather(
        _get_balance_data(),
        _get_usage_recent(),
        _get_usage_all(),
        _get_invoices(),
        _get_api_keys(),
        _get_payment_methods(user, settings),
        _get_models(internal_headers),
        _get_health(internal_headers),
        return_exceptions=True,
    )

    def _safe(val, default):
        return default if isinstance(val, Exception) else val

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "status": user.status,
            "role": user.role,
            "billing_type": user.billing_type,
            "hard_limit_nzd": float(user.hard_limit_nzd),
            "services_enabled": user.services_enabled,
            "theme": user.theme,
            "auto_light_model": user.auto_light_model,
            "auto_heavy_model": user.auto_heavy_model,
            "auto_token_threshold": user.auto_token_threshold,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "balance": _safe(balance_data, {}),
        "usage_recent": _safe(usage_recent, []),
        "usage_all": _safe(usage_all, []),
        "invoices": _safe(invoices, []),
        "api_keys": _safe(api_keys, []),
        "payment_methods": _safe(payment_methods, []),
        "models": _safe(models, {"data": []}),
        "health": _safe(health, {}),
    }
