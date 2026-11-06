import asyncio
import json
import os
from typing import AsyncGenerator, Dict, Any
from app.core.logger import logger

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
BIGBASKET_EVENT_CHANNEL = "bigbasket:events"

# Local fallback queue if Redis server is unreachable
_FALLBACK_SUBSCRIBERS = set()


class BigBasketEventBroadcaster:
    """Manages real-time event broadcasting between background workers and SSE client connections."""

    @classmethod
    async def publish_event(cls, event_data: Dict[str, Any]):
        payload = json.dumps(event_data)
        redis_published = False

        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(REDIS_URL, decode_responses=True)
            await r.publish(BIGBASKET_EVENT_CHANNEL, payload)
            await r.aclose()
            redis_published = True
        except Exception:
            pass

        # Also push to local in-memory fallback subscribers
        dead = []
        for q in _FALLBACK_SUBSCRIBERS:
            try:
                q.put_nowait(payload)
            except Exception:
                dead.append(q)
        for d in dead:
            _FALLBACK_SUBSCRIBERS.discard(d)

    @classmethod
    async def subscribe(cls) -> AsyncGenerator[str, None]:
        """Async generator yielding SSE event strings."""
        q = asyncio.Queue()
        _FALLBACK_SUBSCRIBERS.add(q)

        # Attempt to listen to Redis channel
        redis_client = None
        pubsub = None
        try:
            import redis.asyncio as aioredis
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(BIGBASKET_EVENT_CHANNEL)
        except Exception:
            pubsub = None

        try:
            while True:
                if pubsub:
                    try:
                        msg = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=1.0)
                        if msg and msg.get("data"):
                            yield f"data: {msg['data']}\n\n"
                    except asyncio.TimeoutError:
                        pass
                
                # Check fallback queue
                while not q.empty():
                    item = q.get_nowait()
                    yield f"data: {item}\n\n"

                await asyncio.sleep(0.5)
        finally:
            _FALLBACK_SUBSCRIBERS.discard(q)
            if pubsub:
                await pubsub.unsubscribe(BIGBASKET_EVENT_CHANNEL)
                await pubsub.aclose()
            if redis_client:
                await redis_client.aclose()

