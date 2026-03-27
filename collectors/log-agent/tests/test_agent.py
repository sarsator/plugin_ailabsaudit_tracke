#!/usr/bin/env python3
"""
Tests for ailabsaudit-agent — log parsing, detection, buffer.

Run: python3 tests/test_agent.py -v
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from importlib.machinery import SourceFileLoader

agent = SourceFileLoader("agent", os.path.join(os.path.dirname(__file__), "..", "ailabsaudit-agent.py")).load_module()


class TestLogParsing(unittest.TestCase):

    def test_nginx_combined(self):
        line = '93.184.216.34 - - [10/Mar/2026:14:22:01 +0000] "GET /page HTTP/1.1" 200 5123 "https://chatgpt.com/c/abc" "Mozilla/5.0 (compatible; GPTBot/1.0)"'
        result = agent.parse_log_line(line)
        self.assertIsNotNone(result)
        self.assertEqual(result["ip"], "93.184.216.34")
        self.assertEqual(result["method"], "GET")
        self.assertEqual(result["url"], "/page")
        self.assertEqual(result["status_code"], 200)
        self.assertEqual(result["response_size"], 5123)
        self.assertEqual(result["user_agent"], "Mozilla/5.0 (compatible; GPTBot/1.0)")
        self.assertEqual(result["referer"], "https://chatgpt.com/c/abc")

    def test_apache_common(self):
        line = '10.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /robots.txt HTTP/1.0" 200 2326 "-" "ClaudeBot/1.0"'
        result = agent.parse_log_line(line)
        self.assertIsNotNone(result)
        self.assertEqual(result["url"], "/robots.txt")
        self.assertEqual(result["user_agent"], "ClaudeBot/1.0")

    def test_llms_txt(self):
        line = '10.0.0.1 - - [10/Mar/2026:14:22:01 +0000] "GET /llms.txt HTTP/1.1" 200 1234 "-" "GPTBot/1.0"'
        result = agent.parse_log_line(line)
        self.assertIsNotNone(result)
        self.assertEqual(result["url"], "/llms.txt")
        self.assertEqual(result["user_agent"], "GPTBot/1.0")

    def test_invalid_line(self):
        result = agent.parse_log_line("this is not a log line")
        self.assertIsNone(result)

    def test_empty_line(self):
        result = agent.parse_log_line("")
        self.assertIsNone(result)

    def test_dash_size(self):
        line = '10.0.0.1 - - [10/Mar/2026:00:00:00 +0000] "HEAD / HTTP/1.1" 304 - "-" "PerplexityBot/1.0"'
        result = agent.parse_log_line(line)
        self.assertIsNotNone(result)
        self.assertEqual(result["response_size"], 0)
        self.assertEqual(result["status_code"], 304)


class TestMatchBot(unittest.TestCase):

    def test_gptbot(self):
        self.assertEqual(agent.match_bot("Mozilla/5.0 (compatible; GPTBot/1.0)", agent.BOT_SIGNATURES), "GPTBot")

    def test_claudebot(self):
        self.assertEqual(agent.match_bot("ClaudeBot/1.0", agent.BOT_SIGNATURES), "ClaudeBot")

    def test_case_insensitive(self):
        self.assertEqual(agent.match_bot("gptbot/1.0", agent.BOT_SIGNATURES), "GPTBot")

    def test_no_match_chrome(self):
        self.assertIsNone(agent.match_bot("Mozilla/5.0 Chrome/120.0", agent.BOT_SIGNATURES))

    def test_empty(self):
        self.assertIsNone(agent.match_bot("", agent.BOT_SIGNATURES))

    def test_none(self):
        self.assertIsNone(agent.match_bot(None, agent.BOT_SIGNATURES))


class TestMatchReferrer(unittest.TestCase):

    def test_chatgpt(self):
        self.assertEqual(agent.match_referrer("https://chatgpt.com/c/abc", agent.AI_REFERRERS), "chatgpt.com")

    def test_claude(self):
        self.assertEqual(agent.match_referrer("https://claude.ai/chat/123", agent.AI_REFERRERS), "claude.ai")

    def test_perplexity_subdomain(self):
        self.assertIsNotNone(agent.match_referrer("https://labs.perplexity.ai/search", agent.AI_REFERRERS))

    def test_no_match(self):
        self.assertIsNone(agent.match_referrer("https://google.com/search?q=test", agent.AI_REFERRERS))

    def test_empty(self):
        self.assertIsNone(agent.match_referrer("", agent.AI_REFERRERS))

    def test_dash(self):
        self.assertIsNone(agent.match_referrer("-", agent.AI_REFERRERS))


class TestDetectEvent(unittest.TestCase):

    def test_bot_crawl(self):
        parsed = {
            "user_agent": "Mozilla/5.0 (compatible; GPTBot/1.0)",
            "url": "/page",
            "status_code": 200,
            "response_size": 5000,
            "referer": "",
        }
        event = agent.detect_event(parsed, agent.BOT_SIGNATURES, agent.AI_REFERRERS)
        self.assertIsNotNone(event)
        self.assertEqual(event["type"], "bot_crawl")
        self.assertEqual(event["url"], "/page")

    def test_ai_referral(self):
        parsed = {
            "user_agent": "Mozilla/5.0 Chrome/120.0",
            "url": "/landing",
            "status_code": 200,
            "response_size": 3000,
            "referer": "https://chatgpt.com/c/abc",
        }
        event = agent.detect_event(parsed, agent.BOT_SIGNATURES, agent.AI_REFERRERS)
        self.assertIsNotNone(event)
        self.assertEqual(event["type"], "ai_referral")
        self.assertEqual(event["referrer_domain"], "chatgpt.com")

    def test_robots_txt_crawl(self):
        parsed = {
            "user_agent": "ClaudeBot/1.0",
            "url": "/robots.txt",
            "status_code": 200,
            "response_size": 500,
            "referer": "",
        }
        event = agent.detect_event(parsed, agent.BOT_SIGNATURES, agent.AI_REFERRERS)
        self.assertIsNotNone(event)
        self.assertEqual(event["type"], "bot_crawl")
        self.assertEqual(event["url"], "/robots.txt")

    def test_llms_full_txt_crawl(self):
        parsed = {
            "user_agent": "GPTBot/1.0",
            "url": "/llms-full.txt",
            "status_code": 200,
            "response_size": 10000,
            "referer": "",
        }
        event = agent.detect_event(parsed, agent.BOT_SIGNATURES, agent.AI_REFERRERS)
        self.assertIsNotNone(event)
        self.assertEqual(event["type"], "bot_crawl")
        self.assertEqual(event["url"], "/llms-full.txt")

    def test_no_match(self):
        parsed = {
            "user_agent": "Mozilla/5.0 Chrome/120.0",
            "url": "/page",
            "status_code": 200,
            "response_size": 1000,
            "referer": "https://google.com/",
        }
        event = agent.detect_event(parsed, agent.BOT_SIGNATURES, agent.AI_REFERRERS)
        self.assertIsNone(event)


class TestEventBuffer(unittest.TestCase):

    def test_add(self):
        buf = agent.EventBuffer(send_fn=lambda e: {"success": True})
        buf.add({"type": "bot_crawl", "url": "/test"})
        self.assertEqual(buf.size, 1)

    def test_cap(self):
        buf = agent.EventBuffer(send_fn=lambda e: {"success": True})
        buf._last_flush = 0
        for i in range(agent.MAX_BUFFER_SIZE + 50):
            buf.add({"type": "bot_crawl", "url": f"/p{i}"})
            if buf.size >= agent.MAX_BUFFER_SIZE:
                buf._last_flush = 0
        self.assertLessEqual(buf.size, agent.MAX_BUFFER_SIZE)

    def test_flush(self):
        sent = []
        buf = agent.EventBuffer(send_fn=lambda e: (sent.extend(e), {"success": True})[1])
        buf.add({"type": "bot_crawl", "url": "/f"})
        buf._last_flush = 0
        buf.flush()
        self.assertEqual(len(sent), 1)
        self.assertEqual(buf.size, 0)

    def test_stop_flushes(self):
        sent = []
        buf = agent.EventBuffer(send_fn=lambda e: (sent.extend(e), {"success": True})[1])
        buf.add({"type": "bot_crawl", "url": "/stop"})
        buf.stop()
        self.assertEqual(len(sent), 1)


class TestHMACSigning(unittest.TestCase):

    def test_sign_format(self):
        sig = agent.sign("1234567890", "POST", "/api/v1/tracking/events", '{"test":true}', "secret123")
        self.assertEqual(len(sig), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in sig))

    def test_sign_deterministic(self):
        sig1 = agent.sign("1000", "GET", "/path", "", "key")
        sig2 = agent.sign("1000", "GET", "/path", "", "key")
        self.assertEqual(sig1, sig2)

    def test_sign_differs_with_different_input(self):
        sig1 = agent.sign("1000", "GET", "/path", "", "key")
        sig2 = agent.sign("1001", "GET", "/path", "", "key")
        self.assertNotEqual(sig1, sig2)


if __name__ == "__main__":
    unittest.main()
