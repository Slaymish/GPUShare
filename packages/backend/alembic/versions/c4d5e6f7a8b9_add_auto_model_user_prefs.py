"""add auto model user preferences

Revision ID: c4d5e6f7a8b9
Revises: b3f2a1c4d5e6
Create Date: 2026-03-26 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "b3f2a1c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("auto_light_model", sa.String(), nullable=True))
    op.add_column("users", sa.Column("auto_heavy_model", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "auto_token_threshold",
            sa.Integer(),
            server_default="2000",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "auto_token_threshold")
    op.drop_column("users", "auto_heavy_model")
    op.drop_column("users", "auto_light_model")
