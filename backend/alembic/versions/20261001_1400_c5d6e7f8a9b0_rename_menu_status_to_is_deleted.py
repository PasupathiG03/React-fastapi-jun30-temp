"""rename menus.status to is_deleted

A boolean column literally named "status" sitting next to is_active looked like a duplicate (and had
inverted True/False meaning from it), when it was really just the internal soft-delete marker used by
delete_menu. Renamed for clarity; the data and its meaning are unchanged.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-10-01 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, Sequence[str], None] = 'b4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('menus', 'status', new_column_name='is_deleted')


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('menus', 'is_deleted', new_column_name='status')
