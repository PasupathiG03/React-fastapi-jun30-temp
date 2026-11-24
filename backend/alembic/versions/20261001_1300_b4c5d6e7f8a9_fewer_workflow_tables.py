"""fewer workflow tables: fold stage roles and item history into columns

workflow_stage_roles (a join table) becomes workflow_stages.role_ids, a plain array of role ids -- a
role is only ever soft-deleted (Role.is_active), never actually removed, so there was never a row for
the join table's ON DELETE CASCADE to protect.

workflow_item_history (one row per movement) becomes workflow_items.history, a JSON array of the same
movements. Each entry is a snapshot (action, from/to stage id and name, comment, created_at, actor)
taken at the time, not a live join, so it reads the same before and after this migration.

This takes workflow-specific tables from 5 (workflows, workflow_stages, workflow_stage_roles,
workflow_items, workflow_item_history) down to 3.

Revision ID: b4c5d6e7f8a9
Revises: a3c4d5e6f7a8
Create Date: 2026-10-01 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, Sequence[str], None] = 'a3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # ── Stage roles: join table -> array column ──────────────────────────
    op.add_column(
        'workflow_stages',
        sa.Column('role_ids', postgresql.ARRAY(sa.Integer()), nullable=False, server_default='{}'),
    )
    conn.execute(sa.text(
        "UPDATE workflow_stages ws SET role_ids = agg.role_ids FROM ("
        "  SELECT stage_id, array_agg(role_id ORDER BY role_id) AS role_ids"
        "  FROM workflow_stage_roles GROUP BY stage_id"
        ") agg WHERE agg.stage_id = ws.id"
    ))
    op.drop_table('workflow_stage_roles')

    # ── Item history: rows -> a JSON array per item ──────────────────────
    op.add_column(
        'workflow_items',
        sa.Column('history', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
    )
    conn.execute(sa.text(
        "UPDATE workflow_items wi SET history = agg.history FROM ("
        "  SELECT"
        "    h.item_id,"
        "    jsonb_agg(jsonb_build_object("
        "      'action', h.action,"
        "      'from_stage_id', h.from_stage_id,"
        "      'from_stage_name', fs.name,"
        "      'to_stage_id', h.to_stage_id,"
        "      'to_stage_name', ts.name,"
        "      'comment', h.comment,"
        "      'created_at', h.created_at,"
        "      'actor', CASE WHEN u.id IS NULL THEN NULL"
        "        ELSE jsonb_build_object('employee_id', u.employee_id, 'employee_name', u.employee_name) END"
        "    ) ORDER BY h.id) AS history"
        "  FROM workflow_item_history h"
        "  LEFT JOIN workflow_stages fs ON fs.id = h.from_stage_id"
        "  LEFT JOIN workflow_stages ts ON ts.id = h.to_stage_id"
        "  LEFT JOIN users u ON u.id = h.created_by_id"
        "  GROUP BY h.item_id"
        ") agg WHERE agg.item_id = wi.id"
    ))
    op.drop_table('workflow_item_history')


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()

    # ── Item history: JSON array -> rows ─────────────────────────────────
    op.create_table(
        'workflow_item_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=20), nullable=False),
        sa.Column('from_stage_id', sa.Integer(), nullable=True),
        sa.Column('to_stage_id', sa.Integer(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_workflow_item_history_created_by', ondelete='SET NULL', use_alter=True),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name='fk_workflow_item_history_updated_by', ondelete='SET NULL', use_alter=True),
        sa.ForeignKeyConstraint(['item_id'], ['workflow_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['from_stage_id'], ['workflow_stages.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['to_stage_id'], ['workflow_stages.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_workflow_item_history_id'), 'workflow_item_history', ['id'], unique=False)
    op.create_index(op.f('ix_workflow_item_history_item_id'), 'workflow_item_history', ['item_id'], unique=False)

    # The actor is restored by matching employee_id back to a user row; a since-deleted user's entries
    # keep created_by_id NULL (the JSON snapshot's employee_id/name no longer resolves to a row).
    conn.execute(sa.text(
        "INSERT INTO workflow_item_history "
        "  (item_id, action, from_stage_id, to_stage_id, comment, created_at, created_by_id, updated_by_id)"
        "SELECT"
        "  wi.id,"
        "  entry->>'action',"
        "  NULLIF(entry->>'from_stage_id', '')::int,"
        "  NULLIF(entry->>'to_stage_id', '')::int,"
        "  entry->>'comment',"
        "  COALESCE((entry->>'created_at')::timestamptz, now()),"
        "  u.id,"
        "  u.id "
        "FROM workflow_items wi, jsonb_array_elements(wi.history) AS entry "
        "LEFT JOIN users u ON u.employee_id = entry->'actor'->>'employee_id'"
    ))
    op.drop_column('workflow_items', 'history')

    # ── Stage roles: array column -> join table ──────────────────────────
    op.create_table(
        'workflow_stage_roles',
        sa.Column('stage_id', sa.Integer(), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['stage_id'], ['workflow_stages.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('stage_id', 'role_id'),
    )
    conn.execute(sa.text(
        "INSERT INTO workflow_stage_roles (stage_id, role_id) "
        "SELECT ws.id, r FROM workflow_stages ws, unnest(ws.role_ids) AS r"
    ))
    op.drop_column('workflow_stages', 'role_ids')
