"""Authentication router — signup, login, JWT, and API key management."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from slowapi import Limiter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_db
from app.models import ApiKey, User
from app.schemas.auth import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyResponse,
    LoginRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 7


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_access_token(user: User, secret: str) -> str:
    """Create a signed JWT for the given user."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def _get_client_ip(request: Request) -> str:
    """Resolve the originating client IP, accounting for common proxy headers."""
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


def _self_signup_allowed(*, invite_only: bool, user_count: int) -> bool:
    """Allow public signup only when the node is open or during first-user bootstrap."""
    return user_count == 0 or not invite_only


limiter = Limiter(key_func=_get_client_ip)


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------


async def get_current_user(
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    """Resolve the current user from a Bearer JWT *or* an X-API-Key header."""

    # --- Helper: resolve user from an API key string ---
    async def _resolve_api_key(raw_key: str) -> User | None:
        """Validate an API key (gpus_sk_ or legacy gn_ prefix) and return the user."""
        if raw_key.startswith("gpus_sk_"):
            # Key format: gpus_sk_{uuid}_{random}
            parts = raw_key.split("_", 3)  # ["gpus", "sk", "<uuid>", "<random>"]
            if len(parts) != 4:
                return None
            try:
                key_id = uuid.UUID(parts[2])
            except ValueError:
                return None
        elif raw_key.startswith("gn_"):
            # Legacy key format: gn_{uuid}_{random}
            parts = raw_key.split("_", 2)  # ["gn", "<uuid>", "<random>"]
            if len(parts) != 3:
                return None
            try:
                key_id = uuid.UUID(parts[1])
            except ValueError:
                return None
        else:
            return None

        result = await db.execute(
            select(ApiKey).where(ApiKey.id == key_id, ApiKey.revoked_at.is_(None))
        )
        api_key_row = result.scalar_one_or_none()

        if api_key_row is None or not pwd_context.verify(raw_key, api_key_row.key_hash):
            return None

        # Update last_used timestamp
        api_key_row.last_used = datetime.now(timezone.utc)

        result = await db.execute(select(User).where(User.id == api_key_row.user_id))
        user = result.scalar_one_or_none()
        if user is None or user.status != "active":
            return None
        return user

    # --- Try X-API-Key header first ---
    if x_api_key and (x_api_key.startswith("gpus_sk_") or x_api_key.startswith("gn_")):
        user = await _resolve_api_key(x_api_key)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        return user

    # --- Try Bearer token (API key or JWT) ---
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]

        # Check if the Bearer token is an API key
        if token.startswith("gpus_sk_") or token.startswith("gn_"):
            user = await _resolve_api_key(token)
            if user is None:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
            return user

        # Otherwise, treat as JWT
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = uuid.UUID(payload["sub"])
        except (JWTError, KeyError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or user.status != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing authentication credentials",
    )


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency that ensures the current user has the admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Endpoints
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
    """Register a new user account."""

    # Determine if this is the very first user (bootstrap admin is always allowed).
    count_result = await db.execute(select(func.count()).select_from(User))
    user_count = count_result.scalar() or 0
    is_first_user = user_count == 0

    if not _self_signup_allowed(invite_only=settings.INVITE_ONLY, user_count=user_count):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-signup is disabled on this server. Use an invite link or ask an admin for access.",
        )

    # Check for duplicate email
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

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


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Authenticate with email + password and receive a JWT."""

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.status}",
        )

    token = _create_access_token(user, settings.JWT_SECRET)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return user


@router.patch("/me/limit")
async def update_my_limit(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Let users set their own hard limit (must be stricter than admin default)."""
    from decimal import Decimal
    from app.config import get_settings as _get_settings

    new_limit = body.get("hard_limit_nzd")
    if new_limit is None:
        raise HTTPException(status_code=400, detail="hard_limit_nzd is required")

    admin_default = _get_settings().HARD_LIMIT_DEFAULT
    new_limit_dec = Decimal(str(new_limit))

    # Users can only make their limit stricter (closer to zero) than the admin default
    if new_limit_dec < admin_default:
        raise HTTPException(
            status_code=400,
            detail=f"Limit cannot be lower than the system default ({admin_default})",
        )

    user.hard_limit_nzd = new_limit_dec
    await db.flush()
    return {"hard_limit_nzd": float(user.hard_limit_nzd)}


@router.post("/api-keys", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new API key. The raw key is returned once and cannot be retrieved again."""

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
    """List all non-revoked API keys for the current user."""

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
    """Revoke an API key by setting revoked_at."""

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
