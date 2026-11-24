"""add must_change_password to users

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import bcrypt


# revision identifiers, used by Alembic.
revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, Sequence[str], None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kept as a literal (not imported from app.core.config) so this migration is self-contained and still
# flags existing accounts correctly even if the configured default password is changed later.
_DEFAULT_PASSWORD = b"Admin@123#"


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default='false'),
    )

    # Remediate accounts already sitting on the shared default password before this column existed --
    # not just new ones going forward.
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id, hashed_password FROM users WHERE is_active = true')).fetchall()
    flagged_ids = [
        row.id for row in rows
        if row.hashed_password and bcrypt.checkpw(_DEFAULT_PASSWORD, row.hashed_password.encode())
    ]
    if flagged_ids:
        conn.execute(
            sa.text('UPDATE users SET must_change_password = true WHERE id = ANY(:ids)'),
            {"ids": flagged_ids},
        )


def downgrade() -> None:
    op.drop_column('users', 'must_change_password')
