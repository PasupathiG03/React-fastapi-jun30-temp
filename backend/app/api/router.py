from fastapi import APIRouter

from app.api import access, auth, events, menu, processes, roles, users, workflows

# Every API route in one place. main.py includes this single router.
api_router = APIRouter()

api_router.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
api_router.include_router(menu.router, prefix="/api/menus", tags=["Menus"])
api_router.include_router(users.router, prefix="/api/users", tags=["Users"])
api_router.include_router(roles.router, prefix="/api/roles", tags=["Roles"])
api_router.include_router(processes.router, prefix="/api/processes", tags=["Processes"])
api_router.include_router(events.router, prefix="/api/events", tags=["Live updates"])
api_router.include_router(access.router, prefix="/api/access", tags=["Access"])
api_router.include_router(workflows.router, prefix="/api/workflows", tags=["Workflows"])
