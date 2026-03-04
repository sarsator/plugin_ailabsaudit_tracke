#!/usr/bin/env python3
"""
Buffer tests — add, flush, thread safety.

Run: python3 tests/test_buffer.py -v
"""

import sys
import os
import threading
import time
import unittest

# Add parent src to path.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from ailabsaudit_tracker.buffer import EventBuffer, MAX_BUFFER_SIZE


class TestEventBuffer(unittest.TestCase):

    def test_add_increments_size(self):
        buf = EventBuffer(send_events=lambda e: {"success": True})
        buf.add({"type": "bot_crawl", "url": "/test"})
        self.assertEqual(buf.size, 1)
        buf.add({"type": "bot_crawl", "url": "/test2"})
        self.assertEqual(buf.size, 2)

    def test_buffer_cap(self):
        buf = EventBuffer(send_events=lambda e: {"success": True})
        buf._last_flush_at = 0
        for i in range(MAX_BUFFER_SIZE + 50):
            buf.add({"type": "bot_crawl", "url": f"/page-{i}"})
            if buf.size >= MAX_BUFFER_SIZE:
                buf._last_flush_at = 0
        self.assertLessEqual(buf.size, MAX_BUFFER_SIZE)

    def test_flush_sends_events(self):
        sent = []
        buf = EventBuffer(send_events=lambda e: (sent.extend(e), {"success": True})[1])
        buf.add({"type": "bot_crawl", "url": "/flush"})
        buf._last_flush_at = 0
        buf.flush()
        self.assertEqual(len(sent), 1)
        self.assertEqual(buf.size, 0)

    def test_debounce(self):
        count = [0]
        def send(events):
            count[0] += 1
            return {"success": True}

        buf = EventBuffer(send_events=send)
        buf.add({"type": "bot_crawl", "url": "/d1"})
        buf._last_flush_at = 0
        buf.flush()
        first = count[0]

        buf.add({"type": "bot_crawl", "url": "/d2"})
        buf.flush()  # Should be debounced.
        self.assertEqual(count[0], first)

    def test_retry_on_error(self):
        buf = EventBuffer(send_events=lambda e: {"success": False, "status_code": 500})
        buf.add({"type": "bot_crawl", "url": "/retry"})
        buf._last_flush_at = 0
        buf.flush()
        self.assertEqual(buf.size, 1)
        self.assertEqual(buf._retry_count, 1)

    def test_auth_error_drops(self):
        buf = EventBuffer(send_events=lambda e: {"success": False, "status_code": 401})
        buf.add({"type": "bot_crawl", "url": "/auth"})
        buf._last_flush_at = 0
        buf.flush()
        self.assertEqual(buf.size, 0)

    def test_shutdown_flushes(self):
        sent = []
        buf = EventBuffer(send_events=lambda e: (sent.extend(e), {"success": True})[1])
        buf.add({"type": "bot_crawl", "url": "/shutdown"})
        buf.shutdown()
        self.assertEqual(len(sent), 1)
        self.assertEqual(buf.size, 0)

    def test_thread_safety(self):
        buf = EventBuffer(send_events=lambda e: {"success": True})
        errors = []

        def adder():
            try:
                for i in range(100):
                    buf.add({"type": "bot_crawl", "url": f"/t-{i}"})
            except Exception as exc:
                errors.append(str(exc))

        threads = [threading.Thread(target=adder) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Thread errors: {errors}")
        self.assertLessEqual(buf.size, MAX_BUFFER_SIZE)


if __name__ == "__main__":
    unittest.main()
