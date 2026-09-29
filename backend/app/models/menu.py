from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.user import AuditMixin


class Menu(AuditMixin, Base):
    __tablename__ = "menus"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    icon = Column(String(80), nullable=True)
    url = Column(String(255), nullable=False, unique=True)
    group = Column(String(150), nullable=True)
    order = Column(Integer, default=0, nullable=False)
    process_id = Column(Integer, ForeignKey("processes.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    status = Column(Boolean, default=False, nullable=False)

    process = relationship("Process", backref="screens")

    def __repr__(self) -> str:
        return f"<Menu id={self.id} name={self.name!r}>"
