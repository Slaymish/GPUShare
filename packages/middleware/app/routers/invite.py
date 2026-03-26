"""Invite router — admin invite management and public claim page.

The invite claim page creates a user + API key directly (no hardware needed).
Admin list/create/delete are handled locally (DB ops only).
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_admin
from app.config import get_settings
from app.database import get_db
from app.models import ApiKey, Invite, User

router = APIRouter(tags=["invite"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class InviteCreateRequest(BaseModel):
    name: Optional[str] = None
    expires_in_days: int = 7


class InviteCreateResponse(BaseModel):
    invite_url: str
    token: str
    name: Optional[str]
    expires_at: Optional[datetime]


class InviteListResponse(BaseModel):
    id: str
    token: str
    name: Optional[str]
    created_at: datetime
    claimed_at: Optional[datetime]
    expires_at: Optional[datetime]


@router.post(
    "/v1/admin/invites",
    response_model=InviteCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    body: InviteCreateRequest,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    invite = Invite(
        token=token,
        name=body.name,
        created_by=admin_user.id,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.flush()

    return InviteCreateResponse(
        invite_url=f"/invite/{token}",
        token=token,
        name=body.name,
        expires_at=expires_at,
    )


@router.get("/v1/admin/invites", response_model=list[InviteListResponse])
async def list_invites(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Invite).order_by(Invite.created_at.desc()))
    invites = result.scalars().all()
    return [
        InviteListResponse(
            id=str(inv.id),
            token=inv.token,
            name=inv.name,
            created_at=inv.created_at,
            claimed_at=inv.claimed_at,
            expires_at=inv.expires_at,
        )
        for inv in invites
    ]


@router.delete("/v1/admin/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invite(
    invite_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invite).where(Invite.id == invite_id, Invite.claimed_at.is_(None))
    )
    invite = result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found or already claimed")
    await db.delete(invite)


@router.get("/invite/{token}")
async def claim_invite_page(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()

    result = await db.execute(
        select(Invite).where(Invite.token == token, Invite.claimed_at.is_(None))
    )
    invite = result.scalar_one_or_none()

    if invite is None:
        return HTMLResponse(
            content=_error_page("This invite link has already been used or doesn't exist."),
            status_code=404,
        )

    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        return HTMLResponse(
            content=_error_page("This invite link has expired. Ask for a new one."),
            status_code=410,
        )

    random_password = secrets.token_urlsafe(32)
    user = User(
        email=f"{invite.name or 'user'}+{token[:8]}@invite.gpushare.local",
        name=invite.name,
        password_hash=pwd_context.hash(random_password),
        status="active",
        role="user",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    key_id = uuid.uuid4()
    raw_key = f"gpus_sk_{key_id}_{secrets.token_urlsafe(32)}"
    key_hash = pwd_context.hash(raw_key)

    api_key = ApiKey(
        id=key_id,
        user_id=user.id,
        key_hash=key_hash,
        label=f"{invite.name or 'OpenClaw'} (via invite)",
    )
    db.add(api_key)

    invite.claimed_by = user.id
    invite.claimed_at = datetime.now(timezone.utc)

    await db.flush()

    return HTMLResponse(content=_success_page(settings.NODE_NAME, raw_key))


def _success_page(node_name: str, api_key: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connected to {node_name}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f1117;
            color: #e5e7eb;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }}
        .card {{
            background: #1a1d27;
            border: 1px solid #2d3142;
            border-radius: 16px;
            padding: 2.5rem;
            max-width: 560px;
            width: 100%;
        }}
        .card h1 {{ font-size: 1.5rem; margin-bottom: 0.5rem; }}
        .card .subtitle {{ color: #9ca3af; margin-bottom: 2rem; }}
        .field {{ margin-bottom: 1.5rem; }}
        .field label {{
            display: block;
            font-size: 0.75rem;
            color: #9ca3af;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
        }}
        .field .value {{
            background: #0f1117;
            border: 1px solid #2d3142;
            border-radius: 8px;
            padding: 0.75rem 1rem;
            font-family: 'SF Mono', Monaco, Consolas, monospace;
            font-size: 0.85rem;
            word-break: break-all;
            cursor: pointer;
        }}
        .field .value:hover {{ border-color: #4f8ff7; }}
        .instructions {{
            background: #0f1117;
            border: 1px solid #2d3142;
            border-radius: 8px;
            padding: 1.25rem;
            margin-top: 2rem;
        }}
        .instructions h3 {{ font-size: 0.85rem; margin-bottom: 0.75rem; color: #d1d5db; }}
        .instructions pre {{ font-size: 0.8rem; color: #a5b4fc; white-space: pre-wrap; line-height: 1.6; }}
        .warning {{ margin-top: 1.5rem; font-size: 0.75rem; color: #f59e0b; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>You're connected to {node_name}</h1>
        <p class="subtitle">Your GPU access credentials are below. Save them — the API key won't be shown again.</p>
        <div class="field">
            <label>API URL</label>
            <div class="value" id="api-url-box"></div>
        </div>
        <div class="field">
            <label>API Key</label>
            <div class="value">{api_key}</div>
        </div>
        <div class="instructions">
            <h3>To use with OpenClaw:</h3>
            <pre>clawhub install gpushare

# Then set in your OpenClaw config:
GPUSHARE_API_URL=<span id="api-url-inline"></span>
GPUSHARE_API_KEY={api_key}</pre>
        </div>
        <p class="warning">Save your API key now. It cannot be retrieved after you leave this page.</p>
    </div>
    <script>
        const origin = window.location.origin;
        document.getElementById('api-url-box').textContent = origin;
        document.getElementById('api-url-inline').textContent = origin;
    </script>
</body>
</html>"""


def _error_page(message: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invite Error</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f1117;
            color: #e5e7eb;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }}
        .card {{
            background: #1a1d27;
            border: 1px solid #2d3142;
            border-radius: 16px;
            padding: 2.5rem;
            max-width: 420px;
            width: 100%;
            text-align: center;
        }}
        .card h1 {{ font-size: 1.25rem; margin-bottom: 1rem; color: #f87171; }}
        .card p {{ color: #9ca3af; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Invite Unavailable</h1>
        <p>{message}</p>
    </div>
</body>
</html>"""
