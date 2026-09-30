import asyncio
import time
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.dependencies import authenticate_token
from app.core.events import broadcaster

router = APIRouter()

_open_connections: dict[int, int] = defaultdict(int)  # per server process


def _user_id_for(token: str | None) -> int | None:
    db = SessionLocal()
    try:
        user = authenticate_token(db, token)
        return user.id if user else None
    finally:
        db.close()


RECHECK_EVERY_SECONDS = 60


@router.get("")
async def stream_changes(request: Request):
    """Server-Sent Events: a message arrives whenever menus, permissions, workflows or work items change.
    The browser sends the session cookie with the stream request, so no token ever appears in the URL."""
    user_id = await run_in_threadpool(_user_id_for, request.cookies.get(settings.COOKIE_NAME))
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in or session expired")
    if _open_connections[user_id] >= settings.MAX_LIVE_CONNECTIONS_PER_USER:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many open live connections")

    token = request.cookies.get(settings.COOKIE_NAME)
    _open_connections[user_id] += 1
    queue = broadcaster.subscribe()

    async def events():
        try:
            yield "retry: 3000\n\n"
            last_check = time.monotonic()
            while True:
                if await request.is_disconnected():
                    break
                # A stream must not outlive the session it was opened with (expired, logged out, deactivated).
                if time.monotonic() - last_check > RECHECK_EVERY_SECONDS:
                    last_check = time.monotonic()
                    if await run_in_threadpool(_user_id_for, token) is None:
                        yield "event: session-ended\ndata: {}\n\n"
                        break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # keeps proxies from closing an idle connection
        finally:
            broadcaster.unsubscribe(queue)
            _open_connections[user_id] = max(0, _open_connections[user_id] - 1)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
