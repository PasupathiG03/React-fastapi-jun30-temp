"""workflow items and history

Revision ID: b8d9e0f1a2b3
Revises: a7c8d9e0f1a2
Create Date: 2026-09-30 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d9e0f1a2b3'
down_revision: Union[str, Sequence[str], None] = 'a7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _audit_columns(table: str):
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=f'fk_{table}_created_by', ondelete='SET NULL', use_alter=True),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name=f'fk_{table}_updated_by', ondelete='SET NULL', use_alter=True),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('workflow_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('workflow_id', sa.Integer(), nullable=False),
    sa.Column('current_stage_id', sa.Integer(), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_completed', sa.Boolean(), nullable=False),
    *_audit_columns('workflow_items'),
    sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['current_stage_id'], ['workflow_stages.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workflow_items_id'), 'workflow_items', ['id'], unique=False)
    op.create_index(op.f('ix_workflow_items_workflow_id'), 'workflow_items', ['workflow_id'], unique=False)
    op.create_index(op.f('ix_workflow_items_current_stage_id'), 'workflow_items', ['current_stage_id'], unique=False)

    op.create_table('workflow_item_history',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('item_id', sa.Integer(), nullable=False),
    sa.Column('action', sa.String(length=20), nullable=False),
    sa.Column('from_stage_id', sa.Integer(), nullable=True),
    sa.Column('to_stage_id', sa.Integer(), nullable=True),
    sa.Column('comment', sa.Text(), nullable=True),
    *_audit_columns('workflow_item_history'),
    sa.ForeignKeyConstraint(['item_id'], ['workflow_items.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['from_stage_id'], ['workflow_stages.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['to_stage_id'], ['workflow_stages.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_workflow_item_history_id'), 'workflow_item_history', ['id'], unique=False)
    op.create_index(op.f('ix_workflow_item_history_item_id'), 'workflow_item_history', ['item_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('workflow_item_history')
    op.drop_table('workflow_items')
