"""add bigbasket automation tables

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-11-06 14:00:00.000000

Adds the complete normalized schema for BigBasket AI Image Automation:
- image_batches
- batch_sources
- batch_file_mappings
- batch_images
- processing_attempts
- image_ai_predictions
- image_validation_results
- image_versions
- image_reviews
- batch_events
- batch_exports
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. image_batches
    op.create_table(
        'image_batches',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('batch_code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='created'),
        sa.Column('total_images', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('processed_images', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('approved_images', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('review_needed_images', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_images', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('idempotency_key', sa.String(length=128), nullable=True),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_image_batches_created_by', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_image_batches_updated_by', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_image_batches_id', 'image_batches', ['id'])
    op.create_index('ix_image_batches_batch_code', 'image_batches', ['batch_code'], unique=True)
    op.create_index('ix_image_batches_idempotency_key', 'image_batches', ['idempotency_key'], unique=True)
    op.create_index('ix_image_batches_status', 'image_batches', ['status'])

    # 2. batch_sources
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
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_batch_sources_created_by', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_batch_sources_updated_by', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_batch_sources_id', 'batch_sources', ['id'])
    op.create_index('ix_batch_sources_batch_id', 'batch_sources', ['batch_id'])

    # 3. batch_file_mappings
    op.create_table(
        'batch_file_mappings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('excel_column_map', sa.JSON(), nullable=False),
        sa.Column('validation_status', sa.String(length=50), nullable=False, server_default='valid'),
        sa.Column('error_summary', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_batch_file_mappings_created_by', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_batch_file_mappings_updated_by', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_batch_file_mappings_id', 'batch_file_mappings', ['id'])
    op.create_index('ix_batch_file_mappings_batch_id', 'batch_file_mappings', ['batch_id'])

    # 4. batch_images
    op.create_table(
        'batch_images',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('batch_id', sa.Integer(), sa.ForeignKey('image_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bbid', sa.String(length=100), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('original_file_path', sa.String(length=500), nullable=False),
        sa.Column('original_width', sa.Integer(), nullable=True),
        sa.Column('original_height', sa.Integer(), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('image_type', sa.String(length=50), nullable=False, server_default='unknown'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('sequence_order', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('final_output_path', sa.String(length=500), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_batch_images_created_by', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_batch_images_updated_by', ondelete='SET NULL'), nullable=True),
        sa.UniqueConstraint('batch_id', 'bbid', 'sequence_order', name='uq_batch_images_bbid_sequence'),
    )
    op.create_index('ix_batch_images_id', 'batch_images', ['id'])
    op.create_index('ix_batch_images_batch_id', 'batch_images', ['batch_id'])
    op.create_index('ix_batch_images_bbid', 'batch_images', ['bbid'])
    op.create_index('ix_batch_images_image_type', 'batch_images', ['image_type'])
    op.create_index('ix_batch_images_status', 'batch_images', ['status'])

    # 5. processing_attempts
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

    # 6. image_ai_predictions
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

    # 7. image_validation_results
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

    # 8. image_versions
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

    # 9. image_reviews
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

    # 10. batch_events
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

    # 11. batch_exports
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


def downgrade() -> None:
    op.drop_table('batch_exports')
    op.drop_table('batch_events')
    op.drop_table('image_reviews')
    op.drop_table('image_versions')
    op.drop_table('image_validation_results')
    op.drop_table('image_ai_predictions')
    op.drop_table('processing_attempts')
    op.drop_table('batch_images')
    op.drop_table('batch_file_mappings')
    op.drop_table('batch_sources')
    op.drop_table('image_batches')

