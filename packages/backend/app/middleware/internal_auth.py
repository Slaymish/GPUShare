"""Internal authentication dependency for backend service.

All routes mounted in the backend require this header to prevent
direct access from the internet. Only the middleware should call
the backend, using INTERNAL_SECRET from the shared .env.
"""

from fastapi import Header, HTTPException

from app.config import get_settings


async def require_internal(x_internal_token: str = Header(...)) -> None:
    """Verify that the request comes from the trusted middleware service."""
    secret = get_settings().INTERNAL_SECRET
    if not secret:
        raise HTTPException(status_code=500, detail="INTERNAL_SECRET not configured")
    if x_internal_token != secret:
        raise HTTPException(status_code=403, detail="Forbidden")
