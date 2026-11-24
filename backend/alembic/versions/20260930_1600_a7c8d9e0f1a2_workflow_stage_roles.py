"""workflow stages baseline and stage roles

Revision ID: a7c8d9e0f1a2
Revises: f6b7c8d9e0f1
Create Date: 2026-09-30 16:00:00.000000

The flat workflow_stages table (workflow -> stages) was created outside Alembic after the
earlier migration dropped the old levels/stages tables, so it is created here only when it
is missing. Then the stage <-> role assignment table is added.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'f6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stage_type') THEN CREATE TYPE stage_type AS ENUM ('PRODUCTION', 'QC', 'QA'); END IF; END $$;")

    tables = sa.inspect(op.get_bind()).get_table_names()

    if 'workflow_stages' not in tables:
        op.create_table('workflow_stages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workflow_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('stage_type', sa.Enum('PRODUCTION', 'QC', 'QA', name='stage_type'), nullable=False),
        sa.Column('sequence_order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_workflow_stages_created_by', ondelete='SET NULL', use_alter=True),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name='fk_workflow_stages_updated_by', ondelete='SET NULL', use_alter=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_workflow_stages_id'), 'workflow_stages', ['id'], unique=False)

    if 'workflow_stage_roles' not in tables:
        op.create_table('workflow_stage_roles',
        sa.Column('stage_id', sa.Integer(), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['stage_id'], ['workflow_stages.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('stage_id', 'role_id')
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('workflow_stage_roles')
