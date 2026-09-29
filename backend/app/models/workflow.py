import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.user import AuditMixin


class StageType(str, enum.Enum):
    PRODUCTION = "production"
    QC = "qc"
    QA = "qa"


class Workflow(AuditMixin, Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    levels = relationship(
        "WorkflowLevel",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowLevel.order",
    )

    def __repr__(self) -> str:
        return f"<Workflow id={self.id} name={self.name!r}>"


class WorkflowLevel(AuditMixin, Base):
    __tablename__ = "workflow_levels"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    order = Column(Integer, nullable=False)

    workflow = relationship("Workflow", back_populates="levels")
    stages = relationship(
        "WorkflowStage",
        back_populates="level",
        cascade="all, delete-orphan",
        order_by="WorkflowStage.sequence_order",
    )

    def __repr__(self) -> str:
        return f"<WorkflowLevel id={self.id} order={self.order}>"


class WorkflowStage(AuditMixin, Base):
    __tablename__ = "workflow_stages"

    id = Column(Integer, primary_key=True, index=True)
    level_id = Column(Integer, ForeignKey("workflow_levels.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    stage_type = Column(Enum(StageType, name="stage_type"), nullable=False, default=StageType.PRODUCTION)
    sequence_order = Column(Integer, nullable=False, default=0)

    level = relationship("WorkflowLevel", back_populates="stages")

    def __repr__(self) -> str:
        return f"<WorkflowStage id={self.id} name={self.name!r}>"
