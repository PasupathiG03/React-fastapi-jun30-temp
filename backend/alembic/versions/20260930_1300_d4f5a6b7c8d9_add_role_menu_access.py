"""add role menu access

Revision ID: d4f5a6b7c8d9
Revises: c3e4f5a6b7c8
Create Date: 2026-09-30 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f5a6b7c8d9'
down_revision: Union[str, Sequence[str], None] = 'c3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('role_menu_access',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('role_id', sa.Integer(), nullable=False),
    sa.Column('menu_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['menu_id'], ['menus.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('role_id', 'menu_id', name='uq_role_menu_access')
    )
    op.create_index(op.f('ix_role_menu_access_id'), 'role_menu_access', ['id'], unique=False)
    op.create_index(op.f('ix_role_menu_access_menu_id'), 'role_menu_access', ['menu_id'], unique=False)
    op.create_index(op.f('ix_role_menu_access_role_id'), 'role_menu_access', ['role_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_role_menu_access_role_id'), table_name='role_menu_access')
    op.drop_index(op.f('ix_role_menu_access_menu_id'), table_name='role_menu_access')
    op.drop_index(op.f('ix_role_menu_access_id'), table_name='role_menu_access')
    op.drop_table('role_menu_access')
