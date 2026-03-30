"""Add coding agent preferences to users

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-03-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "coding_agent_directories",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "coding_agent_heartbeat",
            sa.String(),
            server_default=sa.text("'0 * * * *'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "coding_agent_heartbeat")
    op.drop_column("users", "coding_agent_directories")
