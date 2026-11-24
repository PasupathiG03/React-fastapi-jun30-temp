"""drop workflow levels and stages

Revision ID: a1c2d3e4f5a6
Revises: cff15e4cd75f
Create Date: 2026-09-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'cff15e4cd75f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(op.f('ix_workflow_stages_id'), table_name='workflow_stages')
    op.drop_table('workflow_stages')
    op.drop_index(op.f('ix_workflow_levels_id'), table_name='workflow_levels')
    op.drop_table('workflow_levels')
    op.execute('DROP TYPE IF EXISTS stage_type')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table('workflow_levels',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('workflow_id', sa.Integer(), nullable=False),
    sa.Column('order', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('updated_by_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_workflow_levels_created_by', ondelete='SET NULL', use_alter=True),
    sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name='fk_workflow_levels_updated_by', ondelete='SET NULL', use_alter=True),
    sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workflow_levels_id'), 'workflow_levels', ['id'], unique=False)
    op.create_table('workflow_stages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('level_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('stage_type', sa.Enum('PRODUCTION', 'QC', 'QA', name='stage_type'), nullable=False),
    sa.Column('sequence_order', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('updated_by_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_workflow_stages_created_by', ondelete='SET NULL', use_alter=True),
    sa.ForeignKeyConstraint(['level_id'], ['workflow_levels.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name='fk_workflow_stages_updated_by', ondelete='SET NULL', use_alter=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workflow_stages_id'), 'workflow_stages', ['id'], unique=False)
