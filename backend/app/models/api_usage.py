from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.user import User  # noqa: F401
from app.models.bigbasket import ImageBatch, BatchImage  # noqa: F401


class ApiUsageLog(Base):
    """Tracks external & internal API calls (e.g. Photoroom AI, Canvas Processing) per user & batch."""

    __tablename__ = "api_usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    batch_id = Column(Integer, ForeignKey("image_batches.id", ondelete="SET NULL"), nullable=True, index=True)
    image_id = Column(Integer, ForeignKey("batch_images.id", ondelete="SET NULL"), nullable=True, index=True)

    service_name = Column(String(100), default="Classic background remover", nullable=False, index=True)
    provider = Column(String(50), default="photoroom", nullable=False)
    status = Column(String(20), default="success", nullable=False, index=True)  # success, failed
    response_code = Column(Integer, default=200, nullable=False)
    latency_ms = Column(Integer, nullable=True)
    credits = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    batch = relationship("ImageBatch", foreign_keys=[batch_id])
    image = relationship("BatchImage", foreign_keys=[image_id])

    def __repr__(self) -> str:
        return f"<ApiUsageLog id={self.id} user={self.user_id} service={self.service_name!r} status={self.status!r}>"
