from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.user import AuditMixin


class ImageBatch(AuditMixin, Base):
    """Model 1: A batch of product images submitted for BigBasket processing."""

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
    zip_export_path = Column(String(500), nullable=True)
    excel_report_path = Column(String(500), nullable=True)

    # Relationships
    images = relationship("BatchImage", back_populates="batch", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<ImageBatch id={self.id} code={self.batch_code!r} status={self.status!r}>"


class BatchImage(AuditMixin, Base):
    """Model 2: An individual image item in a batch mapped to a BigBasket Product ID (BBID)."""

    __tablename__ = "batch_images"
    __table_args__ = (
        UniqueConstraint("batch_id", "bbid", "sequence_order", name="uq_batch_images_bbid_sequence"),
    )

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("image_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    bbid = Column(String(100), index=True, nullable=False)
    original_filename = Column(String(255), nullable=False)
    original_file_path = Column(String(500), nullable=False)
    segmented_file_path = Column(String(500), nullable=True)
    final_output_path = Column(String(500), nullable=True)
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
    validation_results = Column(JSON, nullable=True)
    review_decision = Column(String(50), nullable=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    review_comments = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    batch = relationship("ImageBatch", back_populates="images")
    reviewer = relationship("User", foreign_keys=[reviewer_id])

    def __repr__(self) -> str:
        return f"<BatchImage id={self.id} bbid={self.bbid!r} status={self.status!r}>"
