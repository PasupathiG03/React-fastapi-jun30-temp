import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.events import broadcaster
from app.core.logger import logger
from app.core.builtin_screens import ensure_default_menus
from app.api.router import api_router

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

app.include_router(api_router)


@app.on_event("startup")
async def on_startup():
    logger.info("Starting %s", settings.PROJECT_NAME)
    ensure_default_menus()
    broadcaster.start(asyncio.get_running_loop())


@app.on_event("shutdown")
async def on_shutdown():
    broadcaster.stop()


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
