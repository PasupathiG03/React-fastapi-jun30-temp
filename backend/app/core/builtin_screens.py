"""Built-in screens: the single source of truth for the sidebar's system menus and the API permission checks.

Every built-in screen is stored in the menus table like any other screen, so the sidebar renders them all
from /api/menus. Missing ones are added on every start (matched by URL), and Router Setup cannot delete them
or change their URL (see app/api/menu.py). Only the Developer role has automatic access to every screen
(see has_full_access in app/core/dependencies.py); every other role, including one named Admin, sees a
built-in screen only once a Developer grants it in Menu Access, the same as any screen you add yourself.
"""

from app.core.database import SessionLocal
from app.core.logger import logger
from app.models.menu import Menu
from app.models.process import Process

# Screen URLs. require_screen() uses these, so they must match the `url` stored in the menus table.
DASHBOARD_SCREEN = "/dashboard"
ROUTER_SETUP_SCREEN = "/developer-management/process-screen"
USER_SCREEN = "/access-control/user-management"
ROLE_SCREEN = "/access-control/role-management"
MENU_ACCESS_SCREEN = "/access-control/menu-access"
WORKFLOW_SCREEN = "/access-control/workflow-management"

# Their APIs are superuser/Developer only, so they are never offered in Menu Access or shown to other roles.
DEVELOPER_ONLY_SCREENS = frozenset({ROUTER_SETUP_SCREEN})

DASHBOARD_PROCESS = {"name": "Dashboard"}
DEVELOPER_PROCESS = {"name": "Developer Management"}
ACCESS_PROCESS = {"name": "Access Control"}

# (process, screen).
DEFAULT_MENUS = [
    (DASHBOARD_PROCESS, {"name": "Dashboard", "icon": "LayoutDashboard", "url": DASHBOARD_SCREEN, "order": 1}),
    (DEVELOPER_PROCESS, {"name": "Router Setup", "icon": "Layers", "url": ROUTER_SETUP_SCREEN, "order": 1}),
    (ACCESS_PROCESS, {"name": "Role Management", "icon": "Shield", "url": ROLE_SCREEN, "order": 1}),
    (ACCESS_PROCESS, {"name": "User Management", "icon": "Users", "url": USER_SCREEN, "order": 2}),
    (ACCESS_PROCESS, {"name": "Menu Access", "icon": "ShieldCheck", "url": MENU_ACCESS_SCREEN, "order": 3}),
    (ACCESS_PROCESS, {"name": "Workflow Management", "icon": "Workflow", "url": WORKFLOW_SCREEN, "order": 4}),
]

BUILT_IN_SCREENS = frozenset(item["url"] for _, item in DEFAULT_MENUS)


def ensure_default_menus():
    """Add any missing built-in screen (and its process), and bring back one that was deleted or
    deactivated before built-in screens were protected. Name, icon, order and process are left as set.
    Grants are never set here: a Developer assigns them in Menu Access like any other screen."""
    db = SessionLocal()
    try:
        added = 0
        for process_data, item in DEFAULT_MENUS:
            process_id = None
            if process_data is not None:
                process = db.query(Process).filter(Process.name == process_data["name"]).first()
                if process is None:
                    process = Process(**process_data, is_active=True)
                    db.add(process)
                    db.flush()
                process_id = process.id

            existing = db.query(Menu).filter(Menu.url == item["url"]).first()
            if existing is not None:
                if item["url"] == ROUTER_SETUP_SCREEN and (existing.is_deleted or not existing.is_active):
                    existing.is_deleted = False
                    existing.is_active = True
                    added += 1
                if existing.process_id != process_id:
                    existing.process_id = process_id
                    added += 1
                continue

            db.add(Menu(**item, process_id=process_id, is_active=True, is_deleted=False))
            added += 1
        db.commit()
        if added:
            logger.info("Added or restored %d built-in screen(s)", added)
    except Exception:
        db.rollback()
        logger.exception("Could not add the built-in screens")
        raise
    finally:
        db.close()
