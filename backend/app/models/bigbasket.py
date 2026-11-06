from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.user import AuditMixin


class ImageBatch(AuditMixin, Base):
    """A batch of product images submitted for BigBasket processing."""

    __tablename__ = "image_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    source_type = Column(String(50), nullable=False)  # manual_upload, google_drive
    status = Column(
        String(50),
        nullable=False,
        default="created",
        index=True,
    )  # created, validating, queued, processing, paused, completed, failed, cancelled

    total_images = Column(Integer, default=0, nullable=False)
    processed_images = Column(Integer, default=0, nullable=False)
    approved_images = Column(Integer, default=0, nullable=False)
    review_needed_images = Column(Integer, default=0, nullable=False)
    failed_images = Column(Integer, default=0, nullable=False)

    idempotency_key = Column(String(128), unique=True, index=True, nullable=True)
    config = Column(JSON, nullable=True)  # Canvas size, DPI, padding presets, confidence threshold

    # Relationships
    sources = relationship("BatchSource", back_populates="batch", cascade="all, delete-orphan")
    file_mappings = relationship("BatchFileMapping", back_populates="batch", cascade="all, delete-orphan")
    images = relationship("BatchImage", back_populates="batch", cascade="all, delete-orphan")
    events = relationship("BatchEvent", back_populates="batch", cascade="all, delete-orphan", order_by="BatchEvent.created_at.desc()")
    exports = relationship("BatchExport", back_populates="batch", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<ImageBatch id={self.id} code={self.batch_code!r} status={self.status!r}>"


class BatchSource(AuditMixin, Base):
    """Source configuration for an image batch (Excel file and/or Google Drive folder)."""

    __tablename__ = "batch_sources"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(50), nullable=False)  # manual_upload, google_drive
    excel_filename = Column(String(255), nullable=True)
    excel_file_path = Column(String(500), nullable=True)
    drive_folder_id = Column(String(255), nullable=True)
    drive_folder_url = Column(String(500), nullable=True)
    drive_auth_token_ref = Column(String(255), nullable=True)

    batch = relationship("ImageBatch", back_populates="sources")


class BatchFileMapping(AuditMixin, Base):
    """Column and BBID mappings extracted from the uploaded Excel / source manifest."""

    __tablename__ = "batch_file_mappings"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    excel_column_map = Column(JSON, nullable=False)  # e.g. {"bbid": "Product ID", "filename": "Image", "type": "Category"}
    validation_status = Column(String(50), default="valid", nullable=False)
    error_summary = Column(JSON, nullable=True)

    batch = relationship("ImageBatch", back_populates="file_mappings")


class BatchImage(AuditMixin, Base):
    """An individual image item in a batch mapped to a BigBasket Product ID (BBID)."""

    __tablename__ = "batch_images"
    __table_args__ = (
        UniqueConstraint("batch_id", "bbid", "sequence_order", name="uq_batch_images_bbid_sequence"),
    )

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    bbid = Column(String(100), index=True, nullable=False)
    original_filename = Column(String(255), nullable=False)
    original_file_path = Column(String(500), nullable=False)
    original_width = Column(Integer, nullable=True)
    original_height = Column(Integer, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)

    image_type = Column(
        String(50),
        default="unknown",
        index=True,
        nullable=False,
    )  # fop, bop, ingredient, nutritional, manufactured_by, fssai, barcode, lifestyle, unknown
    status = Column(
        String(50),
        default="pending",
        index=True,
        nullable=False,
    )  # pending, processing, auto_approved, needs_review, manually_approved, rejected, failed
    sequence_order = Column(Integer, default=1, nullable=False)
    confidence_score = Column(Float, nullable=True)
    final_output_path = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    batch = relationship("ImageBatch", back_populates="images")
    attempts = relationship("ProcessingAttempt", back_populates="image", cascade="all, delete-orphan", order_by="ProcessingAttempt.attempt_number")
    predictions = relationship("ImageAiPrediction", back_populates="image", cascade="all, delete-orphan")
    validation_results = relationship("ImageValidationResult", back_populates="image", cascade="all, delete-orphan")
    versions = relationship("ImageVersion", back_populates="image", cascade="all, delete-orphan")
    reviews = relationship("ImageReview", back_populates="image", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<BatchImage id={self.id} bbid={self.bbid!r} status={self.status!r}>"


class ProcessingAttempt(Base):
    """Execution attempt log for an image processing pipeline job (supports retries)."""

    __tablename__ = "processing_attempts"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("batch_images.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_number = Column(Integer, default=1, nullable=False)
    worker_id = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False)  # started, success, failed, cancelled
    stage = Column(String(50), nullable=True)  # download, classify, segment, inpaint, canvas_pad, validate
    error_type = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    execution_time_ms = Column(Float, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    image = relationship("BatchImage", back_populates="attempts")
    predictions = relationship("ImageAiPrediction", back_populates="attempt")
    validation_results = relationship("ImageValidationResult", back_populates="attempt")


class ImageAiPrediction(Base):
    """Records AI inferences, category classifications, and confidence metrics."""

    __tablename__ = "image_ai_predictions"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("batch_images.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_id = Column(Integer, ForeignKey("processing_attempts.id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(50), nullable=False)  # local_cpu, gemini
    predicted_category = Column(String(50), nullable=False)
    confidence_score = Column(Float, nullable=False)
    raw_response = Column(JSON, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    latency_ms = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    image = relationship("BatchImage", back_populates="predictions")
    attempt = relationship("ProcessingAttempt", back_populates="predictions")


class ImageValidationResult(Base):
    """Automated quality and dimension validation results against BigBasket specifications."""

    __tablename__ = "image_validation_results"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("batch_images.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_id = Column(Integer, ForeignKey("processing_attempts.id", ondelete="SET NULL"), nullable=True, index=True)
    passed = Column(Boolean, default=False, nullable=False)
    dimension_valid = Column(Boolean, default=False, nullable=False)  # 2000x2000
    dpi_valid = Column(Boolean, default=False, nullable=False)        # >= 150 DPI
    alpha_valid = Column(Boolean, default=False, nullable=False)      # transparency present where required
    padding_valid = Column(Boolean, default=False, nullable=False)    # 180px T/B, 100px L/R or 0px edge-to-edge
    aspect_ratio_valid = Column(Boolean, default=False, nullable=False) # 1:1 square
    failure_reasons = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    image = relationship("BatchImage", back_populates="validation_results")
    attempt = relationship("ProcessingAttempt", back_populates="validation_results")


class ImageVersion(Base):
    """Archived intermediate and final output stages of an image (preserves original)."""

    __tablename__ = "image_versions"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("batch_images.id", ondelete="CASCADE"), nullable=False, index=True)
    version_type = Column(
        String(50),
        nullable=False,
    )  # original, segmented, pre_inpaint, post_inpaint, padded, final_output, reviewer_edit
    file_path = Column(String(500), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    is_current = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    image = relationship("BatchImage", back_populates="versions")


class ImageReview(Base):
    """Manual review record with human reviewer actions, bounding box corrections, and notes."""

    __tablename__ = "image_reviews"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("batch_images.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    decision = Column(String(50), nullable=False)  # approved, rejected, reprocess
    crop_adjustments = Column(JSON, nullable=True)  # custom bbox / padding corrections
    comments = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    image = relationship("BatchImage", back_populates="reviews")
    reviewer = relationship("User")


class BatchEvent(Base):
    """Audit log of batch lifecycle events (creation, worker milestones, pausing, completion)."""

    __tablename__ = "batch_events"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(100), nullable=False)  # created, started, chunk_completed, paused, resumed, cancelled, completed, failed
    message = Column(Text, nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    batch = relationship("ImageBatch", back_populates="events")


class BatchExport(Base):
    """Packaged output archive (ZIP of standardized images and Excel exception/summary report)."""

    __tablename__ = "batch_exports"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    zip_file_path = Column(String(500), nullable=False)
    excel_report_path = Column(String(500), nullable=False)
    exported_count = Column(Integer, default=0, nullable=False)
    exported_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    batch = relationship("ImageBatch", back_populates="exports")

