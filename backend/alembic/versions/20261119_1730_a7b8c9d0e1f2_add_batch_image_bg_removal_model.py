"""add bg_removal_model to batch_images

Revision ID: a7b8c9d0e1f2
Revises: 7076b4caa4c9
Create Date: 2026-11-19 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = '7076b4caa4c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('batch_images', sa.Column('bg_removal_model', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('batch_images', 'bg_removal_model')
