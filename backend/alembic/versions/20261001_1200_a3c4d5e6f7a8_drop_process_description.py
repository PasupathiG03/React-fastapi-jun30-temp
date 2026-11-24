"""drop process description

The process description was never shown anywhere useful and is not offered for anything else
in the app, so the field is removed rather than kept unused.

Revision ID: a3c4d5e6f7a8
Revises: f2b3c4d5e6f7
Create Date: 2026-10-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'f2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('processes', 'description')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('processes', sa.Column('description', sa.String(length=500), nullable=True))
