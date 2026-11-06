from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field

from app.schemas.base import CreatorOut


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class PaddingConfig(BaseModel):
    top: int = 180
    bottom: int = 180
    left: int = 100
    right: int = 100


class BatchProcessConfig(BaseModel):
    canvas_width: int = 2000
    canvas_height: int = 2000
    dpi: int = 150
    fop_bop_padding: PaddingConfig = Field(default_factory=PaddingConfig)
    confidence_threshold: float = 0.95
    auto_inpaint_mrp: bool = True
    max_workers: int = 4
    chunk_size: int = 10


# ─────────────────────────────────────────────────────────────────────────────
# BATCH SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class BatchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    source_type: str = Field(default="manual_upload")  # manual_upload, google_drive
    config: Optional[BatchProcessConfig] = None
    idempotency_key: Optional[str] = None


class BatchUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[BatchProcessConfig] = None


class BatchStatusUpdate(BaseModel):
    status: str  # created, queued, processing, paused, cancelled, completed


class BatchOut(BaseModel):
    id: int
    batch_code: str
    name: str
    source_type: str
    status: str
    total_images: int
    processed_images: int
    approved_images: int
    review_needed_images: int
    failed_images: int
    idempotency_key: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[CreatorOut] = None

    model_config = {"from_attributes": True}


class BatchListResponse(BaseModel):
    items: list[BatchOut]
    total: int
    page: int
    page_size: int


# ─────────────────────────────────────────────────────────────────────────────
# EXCEL & MAPPING SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class ExcelColumnMapRequest(BaseModel):
    bbid_column: str
    filename_column: str
    category_column: Optional[str] = None
    sequence_column: Optional[str] = None


class ExcelPreviewResponse(BaseModel):
    filename: str
    total_rows: int
    columns: list[str]
    sample_rows: list[dict[str, Any]]
    suggested_mapping: dict[str, str]


# ─────────────────────────────────────────────────────────────────────────────
# IMAGE & ATTEMPTS SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class ImageVersionOut(BaseModel):
    id: int
    version_type: str
    file_path: str
    width: Optional[int] = None
    height: Optional[int] = None
    file_size_bytes: Optional[int] = None
    is_current: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ValidationResultOut(BaseModel):
    id: int
    passed: bool
    dimension_valid: bool
    dpi_valid: bool
    alpha_valid: bool
    padding_valid: bool
    aspect_ratio_valid: bool
    failure_reasons: Optional[list[str]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AiPredictionOut(BaseModel):
    id: int
    provider: str
    predicted_category: str
    confidence_score: float
    latency_ms: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProcessingAttemptOut(BaseModel):
    id: int
    attempt_number: int
    worker_id: Optional[str] = None
    status: str
    stage: Optional[str] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    execution_time_ms: Optional[float] = None
    started_at: datetime
    ended_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ImageReviewOut(BaseModel):
    id: int
    reviewer_id: Optional[int] = None
    decision: str
    crop_adjustments: Optional[dict[str, Any]] = None
    comments: Optional[str] = None
    reviewed_at: datetime

    model_config = {"from_attributes": True}


class BatchImageOut(BaseModel):
    id: int
    batch_id: int
    bbid: str
    original_filename: str
    original_width: Optional[int] = None
    original_height: Optional[int] = None
    file_size_bytes: Optional[int] = None
    image_type: str
    status: str
    sequence_order: int
    confidence_score: Optional[float] = None
    final_output_path: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    validation_status: Optional[ValidationResultOut] = None
    ai_prediction: Optional[AiPredictionOut] = None

    model_config = {"from_attributes": True}


class BatchImageDetailOut(BatchImageOut):
    attempts: list[ProcessingAttemptOut] = []
    versions: list[ImageVersionOut] = []
    reviews: list[ImageReviewOut] = []


class ImageListResponse(BaseModel):
    items: list[BatchImageOut]
    total: int
    page: int
    page_size: int


# ─────────────────────────────────────────────────────────────────────────────
# MANUAL REVIEW & ACTIONS SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class ReviewActionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approved|rejected|reprocess)$")
    crop_adjustments: Optional[dict[str, Any]] = None
    comments: Optional[str] = None


class BulkReviewActionRequest(BaseModel):
    image_ids: list[int] = Field(..., min_length=1)
    decision: str = Field(..., pattern="^(approved|rejected)$")
    comments: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD & EVENTS SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class DashboardSummaryOut(BaseModel):
    total_batches: int
    total_images: int
    auto_approved_images: int
    manually_approved_images: int
    review_needed_images: int
    failed_images: int
    auto_approval_rate: float
    avg_processing_time_ms: float
    recent_batches: list[BatchOut]


class BatchEventOut(BaseModel):
    id: int
    batch_id: int
    event_type: str
    message: str
    details: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BatchExportOut(BaseModel):
    id: int
    batch_id: int
    zip_file_path: str
    excel_report_path: str
    exported_count: int
    exported_at: datetime

    model_config = {"from_attributes": True}

