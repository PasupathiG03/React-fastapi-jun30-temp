"""A small sliding-window rate limiter kept in memory.

Each server process keeps its own counts, so with N workers the real limit is up to N times higher.
The per-account lockout stored in the database (see app/api/auth.py) is shared by all workers and is the
main protection; this limiter additionally slows down one address trying many usernames.
"""
import threading
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_cleanup = time.monotonic()

    def hit(self, key: str) -> int:
        """Record one attempt. Returns 0 when allowed, otherwise the seconds to wait."""
        now = time.monotonic()
        with self._lock:
            if now - self._last_cleanup > self.window:  # forget keys that went quiet
                for k in [k for k, q in self._hits.items() if not q or now - q[-1] > self.window]:
                    del self._hits[k]
                self._last_cleanup = now
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return int(self.window - (now - q[0])) + 1
            q.append(now)
            return 0
