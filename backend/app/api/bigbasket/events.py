from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.services.bigbasket.events import BigBasketEventBroadcaster

router = APIRouter()


@router.get("/stream")
async def event_stream():
    """SSE endpoint streaming live batch and worker progress events."""
    return StreamingResponse(
        BigBasketEventBroadcaster.subscribe(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

