import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
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
    # Ids of the roles that may open this stage. A plain array column, not a join table with Role: a role
    # is only ever soft-deleted (Role.is_active), never actually removed, so there is no row for an
    # ON DELETE CASCADE to protect against, and the API already validates every id before it is stored
    # (see _validated_role_ids in app/api/workflows.py).
    role_ids = Column(ARRAY(Integer), nullable=False, default=list, server_default="{}")

    workflow = relationship("Workflow", back_populates="stages")

    def __repr__(self) -> str:
        return f"<WorkflowStage id={self.id} name={self.name!r}>"
