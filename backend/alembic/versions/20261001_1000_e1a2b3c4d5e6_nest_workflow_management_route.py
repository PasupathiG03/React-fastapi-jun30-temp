"""nest workflow management route under access control

Revision ID: e1a2b3c4d5e6
Revises: d0f1a2b3c4d5
Create Date: 2026-10-01 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'd0f1a2b3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (data only)."""
    op.execute("UPDATE menus SET url = '/access-control/workflow-management' WHERE url = '/workflow-management'")


def downgrade() -> None:
    """Downgrade schema (data only)."""
    op.execute("UPDATE menus SET url = '/workflow-management' WHERE url = '/access-control/workflow-management'")
