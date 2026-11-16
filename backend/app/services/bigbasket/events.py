import asyncio
import json
import time
from typing import AsyncGenerator, Dict, Any
from app.core.config import settings

REDIS_URL = settings.REDIS_URL
BIGBASKET_EVENT_CHANNEL = "bigbasket:events"

# Local fallback queue if Redis server is unreachable
_FALLBACK_SUBSCRIBERS = set()

# Circuit breaker: a refused connection to a local port can take ~2 s on Windows. When Redis is down, every
# pause/cancel check and every progress event used to pay that price (several seconds per image), so after a
# failure Redis is not retried for REDIS_RETRY_SECS and connects fail fast.
REDIS_RETRY_SECS = 30.0
REDIS_CONNECT_TIMEOUT = 0.3
_redis_down_until = 0.0


def redis_usable() -> bool:
    return time.monotonic() >= _redis_down_until


def mark_redis_down() -> None:
    global _redis_down_until
    _redis_down_until = time.monotonic() + REDIS_RETRY_SECS


def mark_redis_up() -> None:
    global _redis_down_until
    _redis_down_until = 0.0


class BigBasketEventBroadcaster:
    """Manages real-time event broadcasting between background workers and SSE client connections."""

    @classmethod
    async def publish_event(cls, event_data: Dict[str, Any]):
        payload = json.dumps(event_data)

        if redis_usable():
            try:
                import redis.asyncio as aioredis
                r = aioredis.from_url(
                    REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=REDIS_CONNECT_TIMEOUT,
                    socket_timeout=2.0,
                )
                try:
                    await r.publish(BIGBASKET_EVENT_CHANNEL, payload)
                finally:
                    await r.aclose()
                mark_redis_up()
            except Exception:
                mark_redis_down()

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

