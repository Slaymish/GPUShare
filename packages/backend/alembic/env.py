"""Alembic async migration environment."""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

# Load .env so DATABASE_URL is available without the full Settings class
load_dotenv()

from app.database import Base  # noqa: E402

# Import all models so that Base.metadata is fully populated
import app.models.models  # noqa: E402, F401

# Alembic Config object (provides access to alembic.ini values)
config = context.config

# Set up Python logging from the config file
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Read DATABASE_URL directly from environment
database_url = os.environ.get("DATABASE_URL", "")

# MetaData object for 'autogenerate' support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode using an async engine."""
    connectable = create_async_engine(database_url, poolclass=pool.NullPool)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
