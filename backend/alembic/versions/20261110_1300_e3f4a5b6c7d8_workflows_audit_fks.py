"""workflows: add missing created_by / updated_by foreign keys

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-11-10 13:00:00.000000

The AuditMixin on Workflow declares fk_workflows_created_by and
fk_workflows_updated_by, but the table was created without them.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_foreign_key(
        'fk_workflows_created_by', 'workflows', 'users', ['created_by_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_workflows_updated_by', 'workflows', 'users', ['updated_by_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_workflows_updated_by', 'workflows', type_='foreignkey')
    op.drop_constraint('fk_workflows_created_by', 'workflows', type_='foreignkey')
