"""Auth router — signup, login, JWT, API key management, and password reset.

Read operations (login, me, list API keys) are handled locally via DB reads.
Write operations (signup, profile update, password reset confirm, API key
create/revoke) are handled locally — the middleware has full DB write access
for user management tables.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import resend
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import jwt
from passlib.context import CryptContext
from slowapi import Limiter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_db
from app.models import ApiKey, User
from app.auth.dependencies import get_current_user, pwd_context, JWT_ALGORITHM
from app.schemas.auth import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyResponse,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    SignupRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])

JWT_EXPIRY_DAYS = 7


def _create_access_token(user: User, secret: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def _get_client_ip(request: Request) -> str:
    cf_connecting_ip = request.headers.get("cf-connecting-ip")
    if cf_connecting_ip:
        return cf_connecting_ip.strip()
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",", 1)[0].strip()
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


limiter = Limiter(key_func=_get_client_ip)


# ---------------------------------------------------------------------------
# POST /v1/auth/signup
# ---------------------------------------------------------------------------


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
@limiter.limit("2/minute")
async def signup(
    request: Request,
    body: SignupRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    await db.execute(select(func.pg_advisory_xact_lock(0x47505553)))

    count_result = await db.execute(select(func.count()).select_from(User))
    user_count = count_result.scalar() or 0
    is_first_user = user_count == 0

    if is_first_user:
        expected = settings.INITIAL_ADMIN_BOOTSTRAP_TOKEN.strip()
        if not expected:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Bootstrap token not configured.",
            )
        if not body.bootstrap_token or not secrets.compare_digest(body.bootstrap_token, expected):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A valid bootstrap token is required to create the first admin account.",
            )
    elif settings.INVITE_ONLY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-signup is disabled. Use an invite link.",
        )

    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=pwd_context.hash(body.password),
        status="active" if (is_first_user or not settings.REQUIRE_APPROVAL) else "pending",
        role="admin" if is_first_user else "user",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# POST /v1/auth/guest
# ---------------------------------------------------------------------------


@router.post("/guest", response_model=TokenResponse)
@limiter.limit("5/hour")
async def guest_login(
    request: Request,
    settings: Settings = Depends(get_settings),
):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "guest",
        "role": "guest",
        "iat": now,
        "exp": now + timedelta(hours=24),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# POST /v1/auth/login
# ---------------------------------------------------------------------------


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Account is {user.status}")

    token = _create_access_token(user, settings.JWT_SECRET)
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# GET /v1/auth/me
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse)
async def me(user: User | None = Depends(get_current_user)):
    if user is None:
        return UserResponse(
            id="00000000-0000-0000-0000-000000000000",
            email="guest@demo.gpushare.app",
            name="Guest User",
            status="active",
            role="guest",
            billing_type="prepaid",
            hard_limit_nzd=0.0,
            services_enabled=["inference"],
            theme="default",
            auto_light_model=None,
            auto_heavy_model=None,
            auto_token_threshold=2000,
            created_at=datetime.now(timezone.utc),
        )
    return user


# ---------------------------------------------------------------------------
# PATCH /v1/auth/me
# ---------------------------------------------------------------------------


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.name is not None:
        user.name = body.name
    if body.email is not None:
        result = await db.execute(select(User).where(User.email == body.email))
        existing = result.scalar_one_or_none()
        if existing and existing.id != user.id:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = body.email
    if body.theme is not None:
        valid_themes = {"default", "light", "dark"}
        if body.theme not in valid_themes:
            raise HTTPException(status_code=400, detail=f"Invalid theme. Must be one of: {', '.join(valid_themes)}")
        user.theme = body.theme
    if body.auto_light_model is not None:
        user.auto_light_model = body.auto_light_model
    if body.auto_heavy_model is not None:
        user.auto_heavy_model = body.auto_heavy_model
    if body.auto_token_threshold is not None:
        if body.auto_token_threshold < 100 or body.auto_token_threshold > 100000:
            raise HTTPException(status_code=400, detail="Token threshold must be between 100 and 100000")
        user.auto_token_threshold = body.auto_token_threshold
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# PATCH /v1/auth/me/limit
# ---------------------------------------------------------------------------


@router.patch("/me/limit")
async def update_my_limit(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    new_limit = body.get("hard_limit_nzd")
    if new_limit is None:
        raise HTTPException(status_code=400, detail="hard_limit_nzd is required")

    new_limit_dec = Decimal(str(new_limit))
    if new_limit_dec < Decimal(str(settings.HARD_LIMIT_DEFAULT)):
        raise HTTPException(
            status_code=400,
            detail=f"Limit cannot be lower than the system default ({settings.HARD_LIMIT_DEFAULT})",
        )

    user.hard_limit_nzd = new_limit_dec
    await db.flush()
    return {"hard_limit_nzd": float(user.hard_limit_nzd)}


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


@router.post("/password-reset/request")
@limiter.limit("3/hour")
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        return {"message": "If that email exists, a reset link has been sent"}

    reset_token = secrets.token_urlsafe(32)
    user.password_reset_token = reset_token
    user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()

    if settings.RESEND_API_KEY:
        resend.api_key = settings.RESEND_API_KEY
        frontend_base = settings.FRONTEND_URL or settings.NODE_NAME
        reset_url = f"{frontend_base.rstrip('/')}/reset-password?token={reset_token}"
        try:
            resend.Emails.send(
                {
                    "from": "noreply@gpushare.app",
                    "to": user.email,
                    "subject": "Reset your password",
                    "html": f"""<p>Click the link below to reset your password:</p>
                <p><a href="{reset_url}">{reset_url}</a></p>
                <p>This link expires in 1 hour.</p>""",
                }
            )
        except Exception:
            pass

    return {"message": "If that email exists, a reset link has been sent"}


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            User.password_reset_token == body.token,
            User.password_reset_expires > datetime.now(timezone.utc),
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.password_hash = pwd_context.hash(body.password)
    user.password_reset_token = None
    user.password_reset_expires = None
    await db.commit()

    return {"message": "Password reset successful"}


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------


@router.post("/api-keys", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key_id = uuid.uuid4()
    raw_key = f"gpus_sk_{key_id}_{secrets.token_urlsafe(32)}"
    key_hash = pwd_context.hash(raw_key)

    api_key = ApiKey(
        id=key_id,
        user_id=user.id,
        key_hash=key_hash,
        label=body.label,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)

    return ApiKeyCreateResponse(
        key=raw_key,
        id=api_key.id,
        label=api_key.label,
        created_at=api_key.created_at,
    )


@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
        .order_by(ApiKey.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.user_id == user.id,
            ApiKey.revoked_at.is_(None),
        )
    )
    api_key = result.scalar_one_or_none()

    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    api_key.revoked_at = datetime.now(timezone.utc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
