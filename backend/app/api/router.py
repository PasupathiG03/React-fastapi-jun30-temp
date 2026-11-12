from fastapi import APIRouter

from app.api import access, api_dashboard, auth, events, gemini_monitoring, image_analysis, menu, processes, roles, tickets, users, workflows
from app.api.bigbasket.router import bigbasket_router

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
api_router.include_router(tickets.router, prefix="/api/tickets", tags=["Support tickets"])
api_router.include_router(api_dashboard.router, prefix="/api/api-dashboard", tags=["API Dashboard"])
api_router.include_router(gemini_monitoring.router, prefix="/api/gemini-monitoring", tags=["Gemini AI Monitoring"])
api_router.include_router(image_analysis.router, prefix="/api/image-analysis", tags=["Product Image Quality Assessment"])
api_router.include_router(bigbasket_router, prefix="/api/image-studio", tags=["Image Studio Automation"])
