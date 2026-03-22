"""Admin router — user management, balance adjustments, and system stats."""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.lib.billing import get_balance, get_this_month_usage, write_ledger_entry
from app.models import CreditLedger, RenderJob, User
from app.routers.auth import require_admin
from app.schemas.admin import (
    AdminUserResponse,
    AdjustBalanceRequest,
    SystemStatsResponse,
    UserUpdateRequest,
)

router = APIRouter(prefix="/v1/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _user_to_response(db: AsyncSession, user: User) -> AdminUserResponse:
    """Convert a User ORM object to an AdminUserResponse with balance."""
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users with their current balance."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [await _user_to_response(db, u) for u in users]


@router.get("/users/{user_id}", response_model=AdminUserResponse)
async def get_user(
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single user with their current balance."""
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
    """Update user fields (only those provided)."""
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
    """Adjust a user's balance by writing an adjustment ledger entry."""
    # Verify user exists
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
    """Return high-level system statistics."""
    # Total users
    total_users_result = await db.execute(select(func.count()).select_from(User))
    total_users = total_users_result.scalar_one()

    # Active users
    active_users_result = await db.execute(
        select(func.count()).select_from(User).where(User.status == "active")
    )
    active_users = active_users_result.scalar_one()

    # Total inference cost (absolute value of sum of inference_usage entries)
    inference_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.type == "inference_usage"
        )
    )
    total_inference_cost_nzd = abs(float(inference_result.scalar_one()))

    # Total render cost (absolute value of sum of render_usage entries)
    render_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0)).where(
            CreditLedger.type == "render_usage"
        )
    )
    total_render_cost_nzd = abs(float(render_result.scalar_one()))

    # Total balance across all users (sum of entire ledger)
    balance_result = await db.execute(
        select(func.coalesce(func.sum(CreditLedger.amount), 0))
    )
    total_balance_nzd = float(balance_result.scalar_one())

    # Jobs in queue
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


# ---------------------------------------------------------------------------
# GET /v1/admin/health/{integration_key}
# ---------------------------------------------------------------------------


@router.get("/health/{integration_key}")
async def check_integration_health(
    integration_key: str,
    _admin: User = Depends(require_admin),
):
    """Test connectivity for a specific integration."""
    import httpx
    from app.config import get_settings

    settings = get_settings()

    checks = {
        "ollama": _check_ollama,
        "stripe": _check_stripe,
        "r2": _check_r2,
        "resend": _check_resend,
        "openrouter": _check_openrouter,
        "tapo": _check_tapo,
    }

    check_fn = checks.get(integration_key)
    if not check_fn:
        raise HTTPException(status_code=404, detail="Unknown integration")

    try:
        await check_fn(settings)
        return {"status": "ok", "integration": integration_key}
    except Exception as e:
        return {"status": "error", "integration": integration_key, "detail": str(e)}


async def _check_ollama(settings):
    import httpx
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
        r.raise_for_status()


async def _check_stripe(settings):
    import stripe as stripe_lib
    stripe_lib.api_key = settings.STRIPE_SECRET_KEY
    stripe_lib.Account.retrieve()


async def _check_r2(settings):
    import boto3
    s3 = boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
    )
    s3.head_bucket(Bucket=settings.R2_BUCKET_NAME)


async def _check_resend(settings):
    import httpx
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(
            "https://api.resend.com/domains",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        )
        r.raise_for_status()


async def _check_openrouter(settings):
    import httpx
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
        )
        r.raise_for_status()


async def _check_tapo(settings):
    import httpx
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"http://{settings.TAPO_IP}/api/v1/status", timeout=3)
        r.raise_for_status()
