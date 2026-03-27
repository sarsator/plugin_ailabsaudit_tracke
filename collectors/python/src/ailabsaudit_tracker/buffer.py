"""
buffer.py — In-memory event buffer with periodic flush.

Uses threading for timer-based flush. Thread-safe via threading.Lock.
Uses monotonic clock for debounce (immune to NTP adjustments).
"""

import logging
import threading
import time
from typing import Any, Callable, Dict, List

MAX_BUFFER_SIZE = 500
FLUSH_INTERVAL = 300    # 5 minutes in seconds.
FLUSH_DEBOUNCE = 30     # 30 seconds.
MAX_RETRIES = 3

logger = logging.getLogger("ailabsaudit")


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
        self._last_flush_at = 0.0  # monotonic clock
        self._retry_count = 0
        self._stopped = False
        self._events_dropped = 0
        self._flush_errors = 0

    def add(self, event: Dict[str, Any]) -> None:
        """Add an event to the buffer. Auto-flushes at MAX_BUFFER_SIZE."""
        should_flush = False
        with self._lock:
            self._events.append(event)
            # Cap: drop OLDEST events (keep newest).
            if len(self._events) > MAX_BUFFER_SIZE:
                dropped = len(self._events) - MAX_BUFFER_SIZE
                self._events = self._events[dropped:]
                self._events_dropped += dropped
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
        if self._events_dropped > 0 or self._flush_errors > 0:
            logger.warning("Buffer stats: dropped=%d flush_errors=%d",
                           self._events_dropped, self._flush_errors)

    def flush(self) -> None:
        """Trigger a flush (with debounce using monotonic clock)."""
        now = time.monotonic()
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

        self._last_flush_at = time.monotonic()

        try:
            result = self._send_events(events)
            if result.get("success"):
                self._retry_count = 0
                return

            status = result.get("status_code", 0)
            if status in (401, 403):
                logger.warning("Auth error (HTTP %d), %d events discarded", status, len(events))
                self._events_dropped += len(events)
                return

            self._flush_errors += 1
            self._re_store(events)
        except Exception:
            self._flush_errors += 1
            self._re_store(events)

    def _re_store(self, events: List[Dict[str, Any]]) -> None:
        if self._retry_count >= MAX_RETRIES:
            logger.warning("Max retries reached, %d events discarded", len(events))
            self._events_dropped += len(events)
            self._retry_count = 0
            return
        self._retry_count += 1
        with self._lock:
            # Prepend old events (FIFO order), truncate overflow from end.
            combined = events + self._events
            if len(combined) > MAX_BUFFER_SIZE:
                self._events_dropped += len(combined) - MAX_BUFFER_SIZE
                combined = combined[:MAX_BUFFER_SIZE]
            self._events = combined

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
