from sqlalchemy import Boolean, Column, Integer, String

from app.core.database import Base
from app.models.user import AuditMixin


class Menu(AuditMixin, Base):
    __tablename__ = "menus"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    icon = Column(String(80), nullable=False)
    url = Column(String(255), nullable=False, unique=True)
    order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    status = Column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<Menu id={self.id} name={self.name!r}>"
