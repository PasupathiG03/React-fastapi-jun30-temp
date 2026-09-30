from sqlalchemy import Boolean, Column, Integer, String

from app.core.database import Base
from app.models.user import AuditMixin


class Process(AuditMixin, Base):
    __tablename__ = "processes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Process id={self.id} name={self.name!r}>"
