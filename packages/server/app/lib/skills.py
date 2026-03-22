"""Skill discovery and parsing from SKILL.md files."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from app.config import get_settings


@dataclass
class Skill:
    name: str
    description: str
    content: str  # markdown body after frontmatter
    path: Path = field(repr=False)


# In-memory cache, populated on first access.
_skills: dict[str, Skill] | None = None


def _parse_skill_md(path: Path) -> Skill | None:
    """Parse a SKILL.md file, extracting YAML frontmatter and markdown body."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None

    # Extract frontmatter between --- delimiters
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        return None

    try:
        meta = yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        # Fallback: try wrapping values in quotes for common YAML issues
        try:
            fixed = re.sub(r": (.+)", lambda m: f': "{m.group(1)}"', match.group(1))
            meta = yaml.safe_load(fixed)
        except yaml.YAMLError:
            return None

    if not isinstance(meta, dict):
        return None

    name = meta.get("name", "")
    description = meta.get("description", "")

    if not name or not description:
        return None

    body = match.group(2).strip()
    return Skill(name=str(name), description=str(description), content=body, path=path)


def _discover_skills() -> dict[str, Skill]:
    """Scan the configured skills directory for SKILL.md files."""
    settings = get_settings()
    skills_dir = Path(settings.SKILLS_DIR)

    if not skills_dir.is_absolute():
        # Resolve relative to the server package root
        skills_dir = Path(__file__).resolve().parent.parent.parent / skills_dir

    result: dict[str, Skill] = {}

    if not skills_dir.is_dir():
        return result

    for child in sorted(skills_dir.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        skill_file = child / "SKILL.md"
        if not skill_file.is_file():
            continue
        skill = _parse_skill_md(skill_file)
        if skill and skill.name not in result:
            result[skill.name] = skill

    return result


def get_skills() -> dict[str, Skill]:
    """Return all discovered skills (cached after first call)."""
    global _skills
    if _skills is None:
        _skills = _discover_skills()
    return _skills


def reload_skills() -> dict[str, Skill]:
    """Force re-scan of skills directory."""
    global _skills
    _skills = None
    return get_skills()
