"""workflow_stages: add missing created_by / updated_by foreign keys

Revision ID: b1c2d3e4f5a6
Revises: 9c9ed75a8010
Create Date: 2026-11-24 15:00:00.000000

op.create_table() skips ForeignKeyConstraints marked use_alter=True, so a database built from
these migrations gets workflow_stages without fk_workflow_stages_created_by/updated_by (the same
gap e3f4a5b6c7d8 fixed for workflows). Older databases may already have them, so only the
missing ones are created.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = '9c9ed75a8010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FKS = (
    ('fk_workflow_stages_created_by', 'created_by_id'),
    ('fk_workflow_stages_updated_by', 'updated_by_id'),
)


def upgrade() -> None:
    existing = {fk['name'] for fk in sa.inspect(op.get_bind()).get_foreign_keys('workflow_stages')}
    for name, column in FKS:
        if name not in existing:
            op.create_foreign_key(name, 'workflow_stages', 'users', [column], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    # Nothing to undo: older databases had these keys before this migration ran.
    pass
