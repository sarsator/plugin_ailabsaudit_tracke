"""
buffer.py — In-memory event buffer with periodic flush.

Uses threading for timer-based flush. Thread-safe via threading.Lock.
"""

import threading
import time
from typing import Any, Callable, Dict, List

MAX_BUFFER_SIZE = 500
FLUSH_INTERVAL = 300    # 5 minutes in seconds.
FLUSH_DEBOUNCE = 30     # 30 seconds.
MAX_RETRIES = 3


class EventBuffer:
    """Thread-safe in-memory event buffer with periodic flush.

    Args:
        send_events: Callable that sends events and returns dict with 'success' key.
    """

    def __init__(self, send_events: Callable[[List[Dict[str, Any]]], Dict[str, Any]]):
        self._send_events = send_events
        self._events: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._timer = None
        self._last_flush_at = 0.0
        self._retry_count = 0
        self._stopped = False

    def add(self, event: Dict[str, Any]) -> None:
        """Add an event to the buffer. Auto-flushes at MAX_BUFFER_SIZE."""
        should_flush = False
        with self._lock:
            self._events.append(event)
            if len(self._events) > MAX_BUFFER_SIZE:
                self._events = self._events[-MAX_BUFFER_SIZE:]
            if len(self._events) >= MAX_BUFFER_SIZE:
                should_flush = True

        if should_flush:
            self.flush()

    def start(self) -> None:
        """Start periodic flush timer."""
        self._stopped = False
        self._schedule_timer()

    def shutdown(self) -> None:
        """Stop timer and flush remaining events."""
        self._stopped = True
        if self._timer:
            self._timer.cancel()
            self._timer = None
        self._do_flush()

    def flush(self) -> None:
        """Trigger a flush (with debounce)."""
        now = time.time()
        if now - self._last_flush_at < FLUSH_DEBOUNCE:
            return
        self._do_flush()

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._events)

    def _do_flush(self) -> None:
        with self._lock:
            if not self._events:
                return
            events = list(self._events)
            self._events.clear()

        self._last_flush_at = time.time()

        try:
            result = self._send_events(events)
            if result.get("success"):
                self._retry_count = 0
                return

            status = result.get("status_code", 0)
            if status in (401, 403):
                return

            self._re_store(events)
        except Exception:
            self._re_store(events)

    def _re_store(self, events: List[Dict[str, Any]]) -> None:
        if self._retry_count >= MAX_RETRIES:
            self._retry_count = 0
            return
        self._retry_count += 1
        with self._lock:
            self._events = events + self._events
            self._events = self._events[:MAX_BUFFER_SIZE]

    def _schedule_timer(self) -> None:
        if self._stopped:
            return
        self._timer = threading.Timer(FLUSH_INTERVAL, self._timer_tick)
        self._timer.daemon = True
        self._timer.start()

    def _timer_tick(self) -> None:
        if self._stopped:
            return
        self.flush()
        self._schedule_timer()
