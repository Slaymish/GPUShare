"""Auth dependencies for the middleware — JWT and API key resolution.

These are DB-read-only operations: validate the token, look up the user.
No hardware access needed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings, Settings
from app.database import get_db
from app.models.models import ApiKey, User
from fastapi import Depends

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_ALGORITHM = "HS256"


async def get_current_user(
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User | None:
    """Resolve the current user from a Bearer JWT or X-API-Key header.

    Returns None for guest users (sub='guest' in JWT).
    Raises 401 for invalid credentials.
    """

    async def _resolve_api_key(raw_key: str) -> User | None:
        if raw_key.startswith("gpus_sk_"):
            parts = raw_key.split("_", 3)
            if len(parts) != 4:
                return None
            try:
                key_id = uuid.UUID(parts[2])
            except ValueError:
                return None
        elif raw_key.startswith("gn_"):
            parts = raw_key.split("_", 2)
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

        api_key_row.last_used = datetime.now(timezone.utc)

        result = await db.execute(select(User).where(User.id == api_key_row.user_id))
        user = result.scalar_one_or_none()
        if user is None or user.status != "active":
            return None
        return user

    if x_api_key and (x_api_key.startswith("gpus_sk_") or x_api_key.startswith("gn_")):
        user = await _resolve_api_key(x_api_key)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        return user

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]

        if token.startswith("gpus_sk_") or token.startswith("gn_"):
            user = await _resolve_api_key(token)
            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key"
                )
            return user

        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
            sub = payload["sub"]

            if sub == "guest":
                return None

            user_id = uuid.UUID(sub)
        except (JWTError, KeyError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            )

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or user.status != "active":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive"
            )
        return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing authentication credentials",
    )


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency that ensures the current user has the admin role."""
    if user is None or user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
