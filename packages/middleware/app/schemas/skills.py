"""Skill API schemas."""

from __future__ import annotations

from pydantic import BaseModel


class SkillSummary(BaseModel):
    name: str
    description: str


class SkillDetail(BaseModel):
    name: str
    description: str
    content: str
