"""Admin router — aggregated dashboard + user management.

Read operations are handled with direct DB access.
Integration health checks are proxied to the backend.
Admin mutations (update user, adjust balance) are handled locally since
they don't require hardware access.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_admin
from app.backend_client import get_backend_client, _make_internal_headers
from app.database import get_db
from app.lib.billing import get_balance, get_this_month_usage, write_ledger_entry
from app.models import CreditLedger, RenderJob, User
from app.schemas.admin import (
    AdminUserResponse,
    AdjustBalanceRequest,
    SystemStatsResponse,
    UserUpdateRequest,
)

router = APIRouter(prefix="/v1/admin", tags=["admin"])


async def _user_to_response(db: AsyncSession, user: User) -> AdminUserResponse:
    balance = await get_balance(db, user.id)
    month_usage = await get_this_month_usage(db, user.id)
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        status=user.status,
        role=user.role,
        billing_type=user.billing_type,
        hard_limit_nzd=float(user.hard_limit_nzd),
        services_enabled=user.services_enabled,
        created_at=user.created_at,
        balance_nzd=float(balance),
        monthly_usage_nzd=float(month_usage),
    )


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [await _user_to_response(db, u) for u in users]


@router.get("/users/{user_id}", response_model=AdminUserResponse)
async def get_user(
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return await _user_to_response(db, user)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdateRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.status is not None:
        user.status = body.status
    if body.role is not None:
        user.role = body.role
    if body.hard_limit_nzd is not None:
        user.hard_limit_nzd = Decimal(str(body.hard_limit_nzd))
    if body.services_enabled is not None:
        user.services_enabled = body.services_enabled

    await db.flush()
    await db.refresh(user)
    return await _user_to_response(db, user)


@router.post("/users/{user_id}/adjust-balance")
async def adjust_balance(
    user_id: uuid.UUID,
    body: AdjustBalanceRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await write_ledger_entry(
        db,
        user_id=user.id,
        amount=Decimal(str(body.amount_nzd)),
        entry_type="adjustment",
        description=body.description,
    )

    balance = await get_balance(db, user.id)
    return {"balance_nzd": float(balance)}


@router.get("/stats", response_model=SystemStatsResponse)
async def system_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users_result = await db.execute(select(func.count()).select_from(User))
    total_users = total_users_result.scalar_one()

    active_users_result = await db.execute(
        select(func.count()).select_from(User).where(User.status == "active")
    )
    active_users = active_users_result.scalar_one()

    inference_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.type.in_(["inference_usage", "cloud_inference_usage"])
        )
    )
    total_inference_cost_nzd = abs(float(inference_result.scalar_one()))

    render_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.type == "render_usage"
        )
    )
    total_render_cost_nzd = abs(float(render_result.scalar_one()))

    balance_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0))
    )
    total_balance_nzd = float(balance_result.scalar_one())

    queue_result = await db.execute(
        select(func.count()).select_from(RenderJob).where(RenderJob.status == "queued")
    )
    jobs_in_queue = queue_result.scalar_one()

    return SystemStatsResponse(
        total_users=total_users,
        active_users=active_users,
        total_inference_cost_nzd=total_inference_cost_nzd,
        total_render_cost_nzd=total_render_cost_nzd,
        total_balance_nzd=total_balance_nzd,
        jobs_in_queue=jobs_in_queue,
    )


@router.get("/health/{integration_key}")
async def check_integration_health(
    integration_key: str,
    _admin: User = Depends(require_admin),
):
    """Proxy integration health check to the backend."""
    headers = _make_internal_headers()
    try:
        async with get_backend_client() as client:
            resp = await client.get(
                f"/internal/admin/health/{integration_key}",
                headers=headers,
            )
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend unavailable: {exc}")
