from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base
from app.models.user import AuditMixin

class Role(AuditMixin, Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True)
