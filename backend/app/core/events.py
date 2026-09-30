"""Push "something changed" messages to every open browser tab, so the UI can update without a manual refresh.

Changes are published with PostgreSQL NOTIFY and every server process listens with LISTEN, so it also works
when the API runs with several workers. Each process then forwards the message to its connected browsers
over Server-Sent Events (see app/api/events.py).
"""
import asyncio
import json
import select
import threading
import time

import psycopg2
from sqlalchemy import text

from app.core.config import settings
from app.core.logger import logger

CHANNEL = "pulse_changes"


class Broadcaster:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # ── browsers (SSE connections) ───────────────────────────────────────
    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    def _fan_out(self, message: str) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass  # a stuck browser must not block the others; it will resync when it reconnects

    # ── PostgreSQL LISTEN (one background thread per server process) ─────
    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._stop.clear()
        self._thread = threading.Thread(target=self._listen, name="pg-listen", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _listen(self) -> None:
        dsn = settings.DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://")
        delay = 1.0
        while not self._stop.is_set():
            conn = None
            try:
                conn = psycopg2.connect(dsn)
                conn.autocommit = True
                conn.cursor().execute(f"LISTEN {CHANNEL}")
                delay = 1.0
                while not self._stop.is_set():
                    if select.select([conn], [], [], 5.0)[0]:
                        conn.poll()
                        while conn.notifies:
                            note = conn.notifies.pop(0)
                            if self._loop is not None:
                                self._loop.call_soon_threadsafe(self._fan_out, note.payload)
            except Exception as exc:  # database restarted, network blip, ...
                logger.warning("Live-update listener lost its connection (%s); retrying in %.0fs", exc, delay)
                time.sleep(delay)
                delay = min(delay * 2, 30.0)
            finally:
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        pass


broadcaster = Broadcaster()


def publish(kinds: set[str]) -> None:
    """Tell every server process (and so every browser) what kind of data changed."""
    from app.core.database import engine  # local import: database.py imports this module lazily too

    try:
        payload = json.dumps({"kinds": sorted(kinds)})
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_notify(:channel, :payload)"), {"channel": CHANNEL, "payload": payload})
    except Exception as exc:  # never let a notification failure break the request that made the change
        logger.warning("Could not publish live update: %s", exc)
