from sqlalchemy import Column, Integer, String
from app.core.database import Base
from app.models.user import AuditMixin

class Template(AuditMixin, Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    path = Column(String(500), nullable=False)
    size = Column(Integer, nullable=False)
