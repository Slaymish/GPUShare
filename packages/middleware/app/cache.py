"""Simple in-process TTL cache for the middleware layer.

No Redis required — process restarts clear the cache, which is acceptable
for a single-host self-hosted deployment.
"""

from __future__ import annotations

import time
from typing import Any


class TTLCache:
    """Thread-safe (GIL-protected) TTL cache backed by a plain dict."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str, ttl: float) -> Any | None:
        """Return the cached value if it exists and hasn't expired, else None."""
        entry = self._store.get(key)
        if entry is None:
            return None
        value, stored_at = entry
        if time.monotonic() - stored_at > ttl:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        """Store a value with the current timestamp."""
        self._store[key] = (value, time.monotonic())

    def invalidate(self, key: str) -> None:
        """Remove a key from the cache."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Remove all cached entries."""
        self._store.clear()


# Module-level singleton — shared across all requests in a process
cache = TTLCache()
