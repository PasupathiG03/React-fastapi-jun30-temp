"""built-in screens: move them into their processes

The sidebar now renders only from the menus table. Existing built-in screens are moved into the
processes app/core/builtin_screens.py defines (missing ones are added there on startup), and grants of
developer-only screens, which no role can be given, are removed. No role is granted anything here: only
the Developer role has automatic access, and a Developer assigns the rest in Menu Access.

Revision ID: f2b3c4d5e6f7
Revises: e1a2b3c4d5e6
Create Date: 2026-10-01 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = 'e1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copied rather than imported: a migration must keep doing the same thing if builtin_screens.py changes later.
DEVELOPER_PROCESS = ("Developer Management", "Developer tools", 0)
ACCESS_PROCESS = ("Access Control", "Users, roles and permissions", 900)
ACCESS_SCREENS = (
    "/access-control/user-management",
    "/access-control/role-management",
    "/access-control/menu-access",
    "/access-control/workflow-management",
)
ROUTER_SETUP_SCREEN = "/developer-management/process-screen"
DASHBOARD_SCREEN = "/dashboard"
DEVELOPER_ONLY_SCREENS = (DASHBOARD_SCREEN, ROUTER_SETUP_SCREEN)


def _process_id(conn, name: str, description: str, order: int) -> int:
    conn.execute(
        sa.text(
            'INSERT INTO processes (name, description, "order", is_active) '
            "VALUES (:name, :description, :order, true) ON CONFLICT (name) DO NOTHING"
        ),
        {"name": name, "description": description, "order": order},
    )
    return conn.execute(sa.text("SELECT id FROM processes WHERE name = :name"), {"name": name}).scalar_one()


def upgrade() -> None:
    """Upgrade schema (data only)."""
    conn = op.get_bind()
    access_id = _process_id(conn, *ACCESS_PROCESS)
    developer_id = _process_id(conn, *DEVELOPER_PROCESS)

    conn.execute(
        sa.text("UPDATE menus SET process_id = :pid WHERE url IN :urls").bindparams(
            sa.bindparam("urls", expanding=True)
        ),
        {"pid": access_id, "urls": list(ACCESS_SCREENS)},
    )
    conn.execute(sa.text("UPDATE menus SET process_id = :pid WHERE url = :url"), {"pid": developer_id, "url": ROUTER_SETUP_SCREEN})
    conn.execute(sa.text("UPDATE menus SET process_id = NULL WHERE url = :url"), {"url": DASHBOARD_SCREEN})

    conn.execute(
        sa.text(
            "DELETE FROM role_menu_access WHERE menu_id IN (SELECT id FROM menus WHERE url IN :urls)"
        ).bindparams(sa.bindparam("urls", expanding=True)),
        {"urls": list(DEVELOPER_ONLY_SCREENS)},
    )


def downgrade() -> None:
    """Downgrade schema (data only). The previous process of each screen is not recorded, so screens stay
    where they are; the hard-coded sidebar of the previous version hides the duplicates for Developers."""
    pass
