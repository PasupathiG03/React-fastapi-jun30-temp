from sqlalchemy import create_engine, event, inspect
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


# Columns of `users` that every sign-in / sign-out / failed attempt rewrites. A change to only these says
# nothing about menus or permissions, so it must not make every open browser reload (Router Setup, Menu
# Access, ... would flash their loading skeleton each time anyone logs in or out). Sessions ending elsewhere
# are announced separately (publish({"session"}) in app/api/auth.py).
_USER_BOOKKEEPING_COLUMNS = {
    "failed_attempts",
    "locked_until",
    "token_version",
    "last_login_at",
    "hashed_password",
    "updated_at",
    "updated_by_id",
}


def _edit_changes_access(obj) -> bool:
    """True if an edit to this existing object can change what someone sees. An edited user only counts if
    something other than login bookkeeping changed."""
    if getattr(obj, "__tablename__", None) == "users":
        changed = {a.key for a in inspect(obj).attrs if a.history.has_changes()}
        return bool(changed - _USER_BOOKKEEPING_COLUMNS)
    return True


@event.listens_for(SessionLocal, "before_flush")
def _remember_live_changes(session, flush_context, instances):
    kinds = session.info.setdefault("live_kinds", set())
    # New and deleted rows always count; edited rows are checked for what actually changed.
    for obj, is_edit in [(o, False) for o in list(session.new) + list(session.deleted)] + [(o, True) for o in session.dirty]:
        kind = _LIVE_TABLES.get(getattr(obj, "__tablename__", None))
        if kind and (not is_edit or _edit_changes_access(obj)):
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
