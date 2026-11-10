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
    product_category: str = "auto"  # "auto", "food", "non_food"
    confidence_threshold: float = 0.95  # QC auto-approval score required for "auto_approved"
    # Gemini classification confidence below this marks the image uncertain: background removal is skipped
    # and the image goes to manual review.
    classification_confidence_threshold: float = 0.90
    # Auto-extract Ingredients / Nutritional / Marketed-Manufactured By / FSSAI crops from BOP images.
    extract_sub_regions: bool = True
    auto_inpaint_mrp: bool = True
    max_workers: int = 4
    chunk_size: int = 10


# ─────────────────────────────────────────────────────────────────────────────
# BATCH SCHEMAS (Model 1: ImageBatch)
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
    zip_export_path: Optional[str] = None
    excel_report_path: Optional[str] = None
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
# IMAGE SCHEMAS (Model 2: BatchImage)
# ─────────────────────────────────────────────────────────────────────────────

class BatchImageOut(BaseModel):
    id: int
    batch_id: int
    bbid: str
    original_filename: str
    original_file_path: Optional[str] = None
    segmented_file_path: Optional[str] = None
    final_output_path: Optional[str] = None
    original_width: Optional[int] = None
    original_height: Optional[int] = None
    file_size_bytes: Optional[int] = None
    image_type: str
    status: str
    sequence_order: int
    confidence_score: Optional[float] = None
    validation_results: Optional[dict[str, Any]] = None
    validation_status: Optional[dict[str, Any]] = None
    product_category: Optional[str] = None
    review_decision: Optional[str] = None
    reviewer_id: Optional[int] = None
    review_comments: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BatchImageDetailOut(BatchImageOut):
    pass


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
# DASHBOARD SUMMARY
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
