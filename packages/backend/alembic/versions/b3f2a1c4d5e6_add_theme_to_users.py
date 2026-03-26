"""add theme to users

Revision ID: b3f2a1c4d5e6
Revises: 96a04b3f28ca
Create Date: 2026-03-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f2a1c4d5e6'
down_revision: Union[str, None] = '96a04b3f28ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('theme', sa.String(), nullable=False, server_default='default'))


def downgrade() -> None:
    op.drop_column('users', 'theme')
