"""process order

Revision ID: c9e0f1a2b3c4
Revises: b8d9e0f1a2b3
Create Date: 2026-09-30 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9e0f1a2b3c4'
down_revision: Union[str, Sequence[str], None] = 'b8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('processes', sa.Column('order', sa.Integer(), nullable=False, server_default='1'))
    # Give existing processes distinct positions (by name, starting at 1).
    op.execute(
        'UPDATE processes p SET "order" = r.rn FROM '
        '(SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn FROM processes) r WHERE p.id = r.id'
    )
    op.alter_column('processes', 'order', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('processes', 'order')
