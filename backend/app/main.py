from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logger import logger
from app.models.menu import Menu
from app.models.process import Process
from app.api import auth, menu, users, roles, processes, workflows

DEFAULT_PROCESS = {"name": "Administration", "code": "admin", "description": "Core system administration screens"}

DEFAULT_MENUS = [
    {"name": "User Management", "icon": "Users", "url": "/user-management", "order": 1},
    {"name": "Role Management", "icon": "Shield", "url": "/role-management", "order": 2},
]

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8106"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(menu.router, prefix="/api/menus", tags=["Menus"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(roles.router, prefix="/api/roles", tags=["Roles"])
app.include_router(processes.router, prefix="/api/processes", tags=["Processes"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["Workflows"])


@app.on_event("startup")
async def on_startup():
    logger.info("Starting %s", settings.PROJECT_NAME)
    seed_default_menus()


def seed_default_menus():
    """Populate the standard sidebar menus (and their default process) on a
    fresh install so they show up immediately, without an admin having to
    add/import them by hand."""
    db = SessionLocal()
    try:
        if db.query(Menu).first() is not None:
            return
        process = db.query(Process).filter(Process.code == DEFAULT_PROCESS["code"]).first()
        if process is None:
            process = Process(**DEFAULT_PROCESS, is_active=True)
            db.add(process)
            db.flush()
        for item in DEFAULT_MENUS:
            db.add(Menu(**item, process_id=process.id, is_active=True, status=False))
        db.commit()
        logger.info("Seeded %d default menu(s)", len(DEFAULT_MENUS))
    finally:
        db.close()


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
