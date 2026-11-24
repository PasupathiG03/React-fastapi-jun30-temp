"""nest access control routes

Revision ID: f6b7c8d9e0f1
Revises: e5a6b7c8d9e0
Create Date: 2026-09-30 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f6b7c8d9e0f1'
down_revision: Union[str, Sequence[str], None] = 'e5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (data only)."""
    op.execute("UPDATE menus SET url = '/access-control/user-management' WHERE url = '/user-management'")
    op.execute("UPDATE menus SET url = '/access-control/role-management' WHERE url = '/role-management'")


def downgrade() -> None:
    """Downgrade schema (data only)."""
    op.execute("UPDATE menus SET url = '/user-management' WHERE url = '/access-control/user-management'")
    op.execute("UPDATE menus SET url = '/role-management' WHERE url = '/access-control/role-management'")
