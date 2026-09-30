import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.user import AuditMixin


class StageType(str, enum.Enum):
    PRODUCTION = "production"
    QC = "qc"
    QA = "qa"


# Which roles may open a stage (and therefore see it in their sidebar).
workflow_stage_roles = Table(
    "workflow_stage_roles",
    Base.metadata,
    Column("stage_id", Integer, ForeignKey("workflow_stages.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)


class Workflow(AuditMixin, Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    stages = relationship(
        "WorkflowStage",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowStage.sequence_order",
    )

    def __repr__(self) -> str:
        return f"<Workflow id={self.id} name={self.name!r}>"


class WorkflowStage(AuditMixin, Base):
    __tablename__ = "workflow_stages"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    stage_type = Column(Enum(StageType, name="stage_type"), nullable=False, default=StageType.PRODUCTION)
    sequence_order = Column(Integer, nullable=False, default=0)

    workflow = relationship("Workflow", back_populates="stages")
    roles = relationship("Role", secondary=workflow_stage_roles, lazy="selectin")

    @property
    def role_ids(self) -> list[int]:
        return sorted(r.id for r in self.roles)

    def __repr__(self) -> str:
        return f"<WorkflowStage id={self.id} name={self.name!r}>"


class WorkflowItem(AuditMixin, Base):
    """A piece of work travelling through a workflow's stages. current_stage_id is NULL once it is completed."""

    __tablename__ = "workflow_items"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    current_stage_id = Column(Integer, ForeignKey("workflow_stages.id", ondelete="RESTRICT"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_completed = Column(Boolean, default=False, nullable=False)

    workflow = relationship("Workflow")
    current_stage = relationship("WorkflowStage")
    history = relationship(
        "WorkflowItemHistory",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="WorkflowItemHistory.id",
    )

    def __repr__(self) -> str:
        return f"<WorkflowItem id={self.id} title={self.title!r}>"


class WorkflowItemHistory(AuditMixin, Base):
    """One movement of an item: created, advanced, sent back or completed. created_by is the actor."""

    __tablename__ = "workflow_item_history"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("workflow_items.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(20), nullable=False)  # created | advanced | rejected | completed
    from_stage_id = Column(Integer, ForeignKey("workflow_stages.id", ondelete="SET NULL"), nullable=True)
    to_stage_id = Column(Integer, ForeignKey("workflow_stages.id", ondelete="SET NULL"), nullable=True)
    comment = Column(Text, nullable=True)

    item = relationship("WorkflowItem", back_populates="history")
    from_stage = relationship("WorkflowStage", foreign_keys=[from_stage_id])
    to_stage = relationship("WorkflowStage", foreign_keys=[to_stage_id])
