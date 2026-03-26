"""In-memory FIFO queue for local (Ollama) GPU inference."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field


@dataclass
class QueueEntry:
    event: asyncio.Event = field(default_factory=asyncio.Event)


class InferenceQueue:
    """Serialize local inference requests with position tracking."""

    def __init__(self) -> None:
        self._waiters: list[QueueEntry] = []

    def position(self, entry: QueueEntry) -> int:
        """0-based queue position. 0 = currently running, -1 = not found."""
        try:
            return self._waiters.index(entry)
        except ValueError:
            return -1

    async def acquire(self, entry: QueueEntry) -> None:
        """Block until *entry* reaches the front of the queue."""
        self._waiters.append(entry)
        if self._waiters[0] is entry:
            entry.event.set()
        await entry.event.wait()

    def release(self, entry: QueueEntry) -> None:
        """Remove *entry* and wake the next waiter (if any)."""
        try:
            self._waiters.remove(entry)
        except ValueError:
            return
        if self._waiters and not self._waiters[0].event.is_set():
            self._waiters[0].event.set()


# Module-level singleton — lives for the process lifetime.
gpu_queue = InferenceQueue()
