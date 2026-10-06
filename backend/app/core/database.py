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


# ---------------------------------------------------------------------------
# Live updates: after a commit that changed menus / permissions / workflows / work items, tell every
# open browser (see app/core/events.py) so it can refresh itself without a manual page reload.
# ---------------------------------------------------------------------------

# table name -> kind of change ("access" = structure and permissions, "work" = items moving)
_LIVE_TABLES = {
    "menus": "access",
    "processes": "access",
    "workflows": "access",
    "workflow_stages": "access",
    "role_menu_access": "access",
    "roles": "access",
    "users": "access",
}


@event.listens_for(SessionLocal, "before_flush")
def _remember_live_changes(session, flush_context, instances):
    kinds = session.info.setdefault("live_kinds", set())
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        kind = _LIVE_TABLES.get(getattr(obj, "__tablename__", None))
        if kind:
            kinds.add(kind)


@event.listens_for(SessionLocal, "after_bulk_update")
def _remember_bulk_update(update_context):
    mapper = update_context.matched_mapper
    if mapper:
        kind = _LIVE_TABLES.get(getattr(mapper.class_, "__tablename__", None))
        if kind:
            update_context.session.info.setdefault("live_kinds", set()).add(kind)


@event.listens_for(SessionLocal, "after_commit")
def _publish_live_changes(session):
    kinds = session.info.pop("live_kinds", None)
    if kinds:
        from app.core.events import publish

        publish(set(kinds))


@event.listens_for(SessionLocal, "after_rollback")
def _forget_live_changes(session):
    session.info.pop("live_kinds", None)
