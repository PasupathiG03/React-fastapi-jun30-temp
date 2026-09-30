from sqlalchemy import Boolean, Column, Integer, String

from app.core.database import Base
from app.models.user import AuditMixin


class Workflow(AuditMixin, Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Workflow id={self.id} name={self.name!r}>"
