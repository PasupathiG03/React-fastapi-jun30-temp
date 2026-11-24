"""bigbasket: fold review/export columns into batches & images, add API usage logs

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-11-10 12:00:00.000000

Brings the database in line with the current models:
- image_batches: + zip_export_path, excel_report_path
- batch_images:  + segmented_file_path, validation_results, review_decision,
                   reviewer_id (FK users), review_comments, reviewed_at
- new tables:    api_usage_logs (Photoroom / canvas calls),
                 gemini_api_logs (Gemini token + cost metrics)
- dropped tables (no longer modelled or referenced in code): batch_sources,
  batch_file_mappings, processing_attempts, image_ai_predictions,
  image_validation_results, image_versions, image_reviews, batch_events,
  batch_exports. Downgrade recreates them empty (their data is not restored).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _audit_columns(table: str) -> list:
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', name=f'fk_{table}_created_by', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id', name=f'fk_{table}_updated_by', ondelete='SET NULL'), nullable=True),
    ]


def upgrade() -> None:
    # --- image_batches -------------------------------------------------------
    op.add_column('image_batches', sa.Column('zip_export_path', sa.String(length=500), nullable=True))
    op.add_column('image_batches', sa.Column('excel_report_path', sa.String(length=500), nullable=True))

    # --- batch_images --------------------------------------------------------
    op.add_column('batch_images', sa.Column('segmented_file_path', sa.String(length=500), nullable=True))
    op.add_column('batch_images', sa.Column('validation_results', sa.JSON(), nullable=True))
    op.add_column('batch_images', sa.Column('review_decision', sa.String(length=50), nullable=True))
    op.add_column('batch_images', sa.Column('reviewer_id', sa.Integer(), nullable=True))
    op.add_column('batch_images', sa.Column('review_comments', sa.Text(), nullable=True))
    op.add_column('batch_images', sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_batch_images_reviewer', 'batch_images', 'users', ['reviewer_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_batch_images_reviewer_id', 'batch_images', ['reviewer_id'])

    # --- api_usage_logs ------------------------------------------------------
    op.create_table(
        'api_usage_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='SET NULL'), nullable=True),
        sa.Column('image_id', sa.Integer(), sa.ForeignKey('batch_images.id', ondelete='SET NULL'), nullable=True),
        sa.Column('service_name', sa.String(length=100), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('response_code', sa.Integer(), nullable=False),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('credits', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for col in ('id', 'user_id', 'batch_id', 'image_id', 'service_name', 'status', 'created_at'):
        op.create_index(f'ix_api_usage_logs_{col}', 'api_usage_logs', [col])

    # --- gemini_api_logs -----------------------------------------------------
    op.create_table(
        'gemini_api_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('request_id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='SET NULL'), nullable=True),
        sa.Column('image_id', sa.Integer(), sa.ForeignKey('batch_images.id', ondelete='SET NULL'), nullable=True),
        sa.Column('bbid', sa.String(length=100), nullable=True),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('endpoint', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('prompt_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('candidates_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('thoughts_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cached_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_cost_usd', sa.Float(), nullable=False, server_default='0'),
        sa.Column('cost_saved_usd', sa.Float(), nullable=False, server_default='0'),
        sa.Column('latency_ms', sa.Float(), nullable=False, server_default='0'),
        sa.Column('primary_category', sa.String(length=50), nullable=True),
        sa.Column('subcategory', sa.String(length=100), nullable=True),
        sa.Column('product_type', sa.String(length=100), nullable=True),
        sa.Column('classification_confidence', sa.Float(), nullable=True),
        sa.Column('image_type', sa.String(length=50), nullable=True),
        sa.Column('requires_manual_review', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('materials', sa.JSON(), nullable=True),
        sa.Column('components', sa.JSON(), nullable=True),
        sa.Column('visual_properties', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata_payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for col in ('id', 'request_id', 'user_id', 'batch_id', 'image_id', 'bbid',
                'model_name', 'status', 'primary_category', 'created_at'):
        op.create_index(f'ix_gemini_api_logs_{col}', 'gemini_api_logs', [col])

    # --- drop tables the models no longer have (children before parents) ----
    for table in ('batch_exports', 'batch_events', 'image_reviews', 'image_versions',
                  'image_validation_results', 'image_ai_predictions', 'processing_attempts',
                  'batch_file_mappings', 'batch_sources'):
        op.drop_table(table)


def downgrade() -> None:
    # Recreate the dropped tables (empty), same shape as c1d2e3f4a5b6.
    op.create_table(
        'batch_sources',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('excel_filename', sa.String(length=255), nullable=True),
        sa.Column('excel_file_path', sa.String(length=500), nullable=True),
        sa.Column('drive_folder_id', sa.String(length=255), nullable=True),
        sa.Column('drive_folder_url', sa.String(length=500), nullable=True),
        sa.Column('drive_auth_token_ref', sa.String(length=255), nullable=True),
        *_audit_columns('batch_sources'),
    )
    op.create_index('ix_batch_sources_id', 'batch_sources', ['id'])
    op.create_index('ix_batch_sources_batch_id', 'batch_sources', ['batch_id'])

    op.create_table(
        'batch_file_mappings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('excel_column_map', sa.JSON(), nullable=False),
        sa.Column('validation_status', sa.String(length=50), nullable=False, server_default='valid'),
        sa.Column('error_summary', sa.JSON(), nullable=True),
        *_audit_columns('batch_file_mappings'),
    )
    op.create_index('ix_batch_file_mappings_id', 'batch_file_mappings', ['id'])
    op.create_index('ix_batch_file_mappings_batch_id', 'batch_file_mappings', ['batch_id'])

    op.create_table(
        'processing_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('image_id', sa.Integer(), sa.ForeignKey('batch_images.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('worker_id', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('stage', sa.String(length=50), nullable=True),
        sa.Column('error_type', sa.String(length=100), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('execution_time_ms', sa.Float(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_processing_attempts_id', 'processing_attempts', ['id'])
    op.create_index('ix_processing_attempts_image_id', 'processing_attempts', ['image_id'])

    op.create_table(
        'image_ai_predictions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('image_id', sa.Integer(), sa.ForeignKey('batch_images.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('processing_attempts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('predicted_category', sa.String(length=50), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('raw_response', sa.JSON(), nullable=True),
        sa.Column('tokens_used', sa.Integer(), nullable=True),
        sa.Column('latency_ms', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_image_ai_predictions_id', 'image_ai_predictions', ['id'])
    op.create_index('ix_image_ai_predictions_image_id', 'image_ai_predictions', ['image_id'])
    op.create_index('ix_image_ai_predictions_attempt_id', 'image_ai_predictions', ['attempt_id'])

    op.create_table(
        'image_validation_results',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('image_id', sa.Integer(), sa.ForeignKey('batch_images.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('processing_attempts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('passed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dimension_valid', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dpi_valid', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('alpha_valid', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('padding_valid', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('aspect_ratio_valid', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('failure_reasons', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_image_validation_results_id', 'image_validation_results', ['id'])
    op.create_index('ix_image_validation_results_image_id', 'image_validation_results', ['image_id'])
    op.create_index('ix_image_validation_results_attempt_id', 'image_validation_results', ['attempt_id'])

    op.create_table(
        'image_versions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('image_id', sa.Integer(), sa.ForeignKey('batch_images.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version_type', sa.String(length=50), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('is_current', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_image_versions_id', 'image_versions', ['id'])
    op.create_index('ix_image_versions_image_id', 'image_versions', ['image_id'])

    op.create_table(
        'image_reviews',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('image_id', sa.Integer(), sa.ForeignKey('batch_images.id', ondelete='CASCADE'), nullable=False),
        sa.Column('reviewer_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('decision', sa.String(length=50), nullable=False),
        sa.Column('crop_adjustments', sa.JSON(), nullable=True),
        sa.Column('comments', sa.Text(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_image_reviews_id', 'image_reviews', ['id'])
    op.create_index('ix_image_reviews_image_id', 'image_reviews', ['image_id'])
    op.create_index('ix_image_reviews_reviewer_id', 'image_reviews', ['reviewer_id'])

    op.create_table(
        'batch_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_batch_events_id', 'batch_events', ['id'])
    op.create_index('ix_batch_events_batch_id', 'batch_events', ['batch_id'])

    op.create_table(
        'batch_exports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('zip_file_path', sa.String(length=500), nullable=False),
        sa.Column('excel_report_path', sa.String(length=500), nullable=False),
        sa.Column('exported_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('exported_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_batch_exports_id', 'batch_exports', ['id'])
    op.create_index('ix_batch_exports_batch_id', 'batch_exports', ['batch_id'])

    # Drop the new tables and columns.
    op.drop_table('gemini_api_logs')
    op.drop_table('api_usage_logs')

    op.drop_index('ix_batch_images_reviewer_id', table_name='batch_images')
    op.drop_constraint('fk_batch_images_reviewer', 'batch_images', type_='foreignkey')
    for col in ('reviewed_at', 'review_comments', 'reviewer_id', 'review_decision',
                'validation_results', 'segmented_file_path'):
        op.drop_column('batch_images', col)
    op.drop_column('image_batches', 'excel_report_path')
    op.drop_column('image_batches', 'zip_export_path')
