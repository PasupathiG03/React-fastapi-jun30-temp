"""tickets start as "new" until a Developer opens them

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-10-26 18:00:00.000000

Only the column default changes. Tickets already stored as "open" stay "open".
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b0c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('tickets', 'status', server_default='new')


def downgrade() -> None:
    op.execute("UPDATE tickets SET status = 'open' WHERE status = 'new'")
    op.alter_column('tickets', 'status', server_default='open')
