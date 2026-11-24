"""add last_login_at to users (one active session per account)

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-10-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8a9b0c1d2e3'
down_revision: Union[str, Sequence[str], None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    # End every session opened before "one active session per account" existed, so the rule applies to
    # everyone from the moment this is deployed -- not only after each person's next sign-in. Users simply
    # sign in again once.
    op.execute('UPDATE users SET token_version = COALESCE(token_version, 0) + 1')


def downgrade() -> None:
    op.drop_column('users', 'last_login_at')
