import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.events import broadcaster
from app.core.logger import logger
from app.models.menu import Menu
from app.models.process import Process
from app.api import access, auth, events, menu, users, roles, processes, workflows

DEFAULT_PROCESS = {"name": "Administration", "description": "Core system administration screens"}

DEFAULT_MENUS = [
    {"name": "User Management", "icon": "Users", "url": "/access-control/user-management", "order": 1},
    {"name": "Role Management", "icon": "Shield", "url": "/access-control/role-management", "order": 2},
]

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

ALLOWED_ORIGINS = settings.cors_origins
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def block_cross_site_writes(request: Request, call_next):
    """A browser always sends Origin on a cross-site POST/PUT/DELETE. Refuse it unless the origin is ours,
    so another website can never make a signed-in user's browser change data (CSRF)."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") not in ALLOWED_ORIGINS:
            return JSONResponse({"detail": "Cross-site request refused"}, status_code=403)
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if not request.url.path.startswith(DOC_PATHS):  # the interactive docs (DEBUG only) load scripts from a CDN
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"  # signed-in data must not be kept by shared caches
    return response


# Added last so it is the outermost layer and its headers also appear on the responses above.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,  # the session cookie; safe because origins are an explicit list, never "*"
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(menu.router, prefix="/api/menus", tags=["Menus"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(roles.router, prefix="/api/roles", tags=["Roles"])
app.include_router(processes.router, prefix="/api/processes", tags=["Processes"])
app.include_router(events.router, prefix="/api/events", tags=["Live updates"])
app.include_router(access.router, prefix="/api/access", tags=["Access"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["Workflows"])


@app.on_event("startup")
async def on_startup():
    logger.info("Starting %s", settings.PROJECT_NAME)
    seed_default_menus()
    broadcaster.start(asyncio.get_running_loop())


@app.on_event("shutdown")
async def on_shutdown():
    broadcaster.stop()


def seed_default_menus():
    """Populate the standard sidebar menus (and their default process) on a
    fresh install so they show up immediately, without an admin having to
    add/import them by hand."""
    db = SessionLocal()
    try:
        if db.query(Menu).first() is not None:
            return
        process = db.query(Process).filter(Process.name == DEFAULT_PROCESS["name"]).first()
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
