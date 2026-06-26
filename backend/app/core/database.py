from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings
from app.core.context import get_current_user_id

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Auto-populate audit fields (created_by_id / updated_by_id) via context var
# ---------------------------------------------------------------------------

@event.listens_for(SessionLocal, "before_flush")
def _set_audit_user(session, flush_context, instances):
    from app.models.user import AuditMixin  # local import to avoid circular deps

    user_id = get_current_user_id()
    if user_id is None:
        return

    for obj in session.new:
        if isinstance(obj, AuditMixin) and obj.created_by_id is None:
            obj.created_by_id = user_id
            obj.updated_by_id = user_id

    for obj in session.dirty:
        if isinstance(obj, AuditMixin):
            obj.updated_by_id = user_id
