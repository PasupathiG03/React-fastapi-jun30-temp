"""drop process code

Revision ID: b2d3e4f5a6b7
Revises: a1c2d3e4f5a6
Create Date: 2026-09-30 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d3e4f5a6b7'
down_revision: Union[str, Sequence[str], None] = 'a1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('processes', 'code')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('processes', sa.Column('code', sa.String(length=50), nullable=True))
    op.execute("UPDATE processes SET code = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || id")
    op.alter_column('processes', 'code', nullable=False)
    op.create_unique_constraint('processes_code_key', 'processes', ['code'])
