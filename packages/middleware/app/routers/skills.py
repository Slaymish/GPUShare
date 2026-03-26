"""Skills router — reads skill files from disk, cached 5 minutes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.cache import cache
from app.lib.skills import get_skills
from app.models import User
from app.schemas.skills import SkillDetail, SkillSummary

router = APIRouter(prefix="/v1/skills", tags=["skills"])

SKILLS_CACHE_TTL = 300.0  # 5 minutes


@router.get("", response_model=list[SkillSummary])
async def list_skills(user: User | None = Depends(get_current_user)):
    cached = cache.get("skills_list", SKILLS_CACHE_TTL)
    if cached is not None:
        return cached

    skills = get_skills()
    result = [SkillSummary(name=s.name, description=s.description) for s in skills.values()]
    cache.set("skills_list", result)
    return result


@router.get("/{name}", response_model=SkillDetail)
async def get_skill(name: str, user: User | None = Depends(get_current_user)):
    skills = get_skills()
    skill = skills.get(name)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return SkillDetail(name=skill.name, description=skill.description, content=skill.content)
