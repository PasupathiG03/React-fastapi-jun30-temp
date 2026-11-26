import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.events import broadcaster
from app.core.logger import logger
from app.core.builtin_screens import ensure_default_menus
from app.api.router import api_router
from app.services.bigbasket.sub_region_extractor import get_ocr_status, warm_up_ocr

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
        if origin and not settings.origin_allowed(origin):
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
    allow_origin_regex=settings.cors_origin_regex,  # private-network addresses on the frontend port
    allow_credentials=True,  # the session cookie; safe because origins are an explicit list or private-network addresses, never "*"
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Session-Ended"],  # lets the UI say "signed in elsewhere" instead of "expired"
)

app.include_router(api_router)


@app.on_event("startup")
async def on_startup():
    logger.info("Starting %s", settings.PROJECT_NAME)
    ensure_default_menus()
    loop = asyncio.get_running_loop()
    broadcaster.start(loop)
    # Load the RapidOCR models in the background so startup is not blocked; /health shows "initializing" until done.
    loop.run_in_executor(None, warm_up_ocr)
    # Automatically resume any batches/images interrupted by a deploy or worker restart
    from app.tasks.batch_tasks import recover_interrupted_tasks
    loop.run_in_executor(None, recover_interrupted_tasks)


@app.on_event("shutdown")
async def on_shutdown():
    broadcaster.stop()


@app.get("/health", tags=["Health"])
def health():
    ocr = get_ocr_status()

    # Check database connectivity
    db_status = "ok"
    try:
        from app.core.database import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception as e:
        db_status = f"unhealthy: {type(e).__name__}"

    # Check Redis connectivity
    redis_status = "ok"
    try:
        from app.services.bigbasket.events import redis_usable
        if not redis_usable():
            redis_status = "unreachable"
    except Exception as e:
        redis_status = f"error: {type(e).__name__}"

    is_ok = (ocr.get("status") != "unavailable") and (db_status == "ok")
    return {
        "status": "ok" if is_ok else "degraded",
        "database": db_status,
        "redis": redis_status,
        "ocr": ocr,
    }
