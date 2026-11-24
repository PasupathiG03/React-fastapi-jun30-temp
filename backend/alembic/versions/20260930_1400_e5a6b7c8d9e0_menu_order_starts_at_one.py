"""menu order starts at one

Revision ID: e5a6b7c8d9e0
Revises: d4f5a6b7c8d9
Create Date: 2026-09-30 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e5a6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = 'd4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute('UPDATE menus SET "order" = 1 WHERE "order" < 1')


def downgrade() -> None:
    """Downgrade schema (data-only change, nothing to undo)."""
