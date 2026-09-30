import asyncio

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.core.database import SessionLocal
from app.core.events import broadcaster
from app.core.security import decode_access_token

router = APIRouter()


def _is_active_user(employee_id: str) -> bool:
    from app.models.user import User

    db = SessionLocal()
    try:
        return db.query(User.id).filter(User.employee_id == employee_id, User.is_active == True).first() is not None
    finally:
        db.close()


@router.get("")
async def stream_changes(request: Request, token: str):
    """Server-Sent Events: a message arrives whenever menus, permissions, workflows or work items change.
    The token is a query parameter because the browser's EventSource cannot send headers."""
    employee_id = decode_access_token(token)
    if not employee_id or not await run_in_threadpool(_is_active_user, employee_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    queue = broadcaster.subscribe()

    async def events():
        try:
            yield "retry: 3000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=20)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # keeps proxies from closing an idle connection
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
