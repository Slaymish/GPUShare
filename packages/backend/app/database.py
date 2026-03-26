"""Async SQLAlchemy engine, session factory, and declarative base."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


@lru_cache
def get_engine():
    from app.config import get_settings
    settings = get_settings()
    return create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
    )


@lru_cache
def get_session_factory():
    return async_sessionmaker(
        get_engine(),
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with get_session_factory()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
