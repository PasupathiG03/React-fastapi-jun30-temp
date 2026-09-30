from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint

from app.core.database import Base


class RoleMenuAccess(Base):
    """Grants a role access to one screen (menu). A row means "allowed"."""

    __tablename__ = "role_menu_access"
    __table_args__ = (UniqueConstraint("role_id", "menu_id", name="uq_role_menu_access"),)

    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_id = Column(Integer, ForeignKey("menus.id", ondelete="CASCADE"), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<RoleMenuAccess role={self.role_id} menu={self.menu_id}>"
