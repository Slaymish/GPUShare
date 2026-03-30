"""Household router — shared flatmate data backed by ~/.openclaw/household/data.json.

Free to use (no billing check). Any authenticated user can read or modify.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/v1/household", tags=["household"])

HOUSEHOLD_FILE = Path.home() / ".openclaw" / "household" / "data.json"

_EMPTY: dict = {"shopping_list": [], "reminders": [], "notes": [], "flatmates": []}


def _read() -> dict:
    if not HOUSEHOLD_FILE.exists():
        return {k: list(v) for k, v in _EMPTY.items()}
    try:
        return json.loads(HOUSEHOLD_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {k: list(v) for k, v in _EMPTY.items()}


def _write(data: dict) -> None:
    HOUSEHOLD_FILE.parent.mkdir(parents=True, exist_ok=True)
    HOUSEHOLD_FILE.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ShoppingItemRequest(BaseModel):
    item: str


class ReminderRequest(BaseModel):
    text: str
    due: str  # ISO datetime string


class NoteRequest(BaseModel):
    title: str
    body: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("")
async def get_household(_: User = Depends(get_current_user)) -> dict:
    return _read()


@router.post("/shopping")
async def add_shopping(
    body: ShoppingItemRequest,
    user: User = Depends(get_current_user),
) -> dict:
    data = _read()
    data["shopping_list"].append(
        {
            "item": body.item,
            "added_by": user.name or user.email,
            "added_at": datetime.now(timezone.utc).date().isoformat(),
        }
    )
    _write(data)
    return data


@router.delete("/shopping/{item}")
async def remove_shopping(
    item: str,
    _: User = Depends(get_current_user),
) -> dict:
    data = _read()
    data["shopping_list"] = [
        e for e in data["shopping_list"] if e.get("item", "").lower() != item.lower()
    ]
    _write(data)
    return data


@router.post("/reminders")
async def add_reminder(
    body: ReminderRequest,
    user: User = Depends(get_current_user),
) -> dict:
    data = _read()
    data["reminders"].append(
        {
            "text": body.text,
            "due": body.due,
            "added_by": user.name or user.email,
        }
    )
    _write(data)
    return data


@router.delete("/reminders/{index}")
async def remove_reminder(
    index: int,
    _: User = Depends(get_current_user),
) -> dict:
    data = _read()
    if index < 0 or index >= len(data["reminders"]):
        raise HTTPException(status_code=404, detail="Reminder not found")
    data["reminders"].pop(index)
    _write(data)
    return data


@router.post("/notes")
async def add_note(
    body: NoteRequest,
    user: User = Depends(get_current_user),
) -> dict:
    data = _read()
    data["notes"].append(
        {
            "title": body.title,
            "body": body.body,
            "added_by": user.name or user.email,
        }
    )
    _write(data)
    return data
