"""Skills discovery and retrieval endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.lib.skills import get_skills
from app.models import User
from app.routers.auth import get_current_user
from app.schemas.skills import SkillDetail, SkillSummary

router = APIRouter(prefix="/v1/skills", tags=["skills"])


@router.get("", response_model=list[SkillSummary])
async def list_skills(user: User = Depends(get_current_user)):
    """Return the skill catalog (name + description only)."""
    skills = get_skills()
    return [
        SkillSummary(name=s.name, description=s.description)
        for s in skills.values()
    ]


@router.get("/{name}", response_model=SkillDetail)
async def get_skill(name: str, user: User = Depends(get_current_user)):
    """Return a skill's full content."""
    skills = get_skills()
    skill = skills.get(name)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return SkillDetail(name=skill.name, description=skill.description, content=skill.content)
