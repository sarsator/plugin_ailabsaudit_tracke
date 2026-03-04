#!/usr/bin/env python3
"""
Detection tests — match_bot, match_referrer, false positives.

Run: python3 tests/test_detection.py -v
"""

import sys
import os
import unittest

# Add parent src to path.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from ailabsaudit_tracker.detector import match_bot, match_referrer
from ailabsaudit_tracker.defaults import BOT_SIGNATURES, AI_REFERRERS


class TestMatchBot(unittest.TestCase):

    def test_detects_gptbot(self):
        self.assertEqual(
            match_bot("Mozilla/5.0 (compatible; GPTBot/1.0)", BOT_SIGNATURES),
            "GPTBot",
        )

    def test_detects_claudebot(self):
        self.assertEqual(match_bot("ClaudeBot/1.0", BOT_SIGNATURES), "ClaudeBot")

    def test_case_insensitive(self):
        self.assertEqual(
            match_bot("mozilla/5.0 gptbot/1.0", BOT_SIGNATURES), "GPTBot"
        )

    def test_detects_perplexitybot(self):
        self.assertEqual(
            match_bot("Mozilla/5.0 PerplexityBot/1.0", BOT_SIGNATURES),
            "PerplexityBot",
        )

    def test_detects_deepseekbot(self):
        self.assertEqual(match_bot("DeepSeekBot/1.0", BOT_SIGNATURES), "DeepSeekBot")

    def test_detects_bingbot(self):
        self.assertEqual(
            match_bot("Mozilla/5.0 (compatible; bingbot/2.0)", BOT_SIGNATURES),
            "bingbot",
        )

    def test_detects_googlebot(self):
        result = match_bot("Googlebot/2.1 (+http://www.google.com/bot.html)", BOT_SIGNATURES)
        self.assertIsNotNone(result)

    def test_no_match_chrome(self):
        self.assertIsNone(
            match_bot(
                "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36", BOT_SIGNATURES
            )
        )

    def test_no_match_firefox(self):
        self.assertIsNone(
            match_bot(
                "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
                BOT_SIGNATURES,
            )
        )

    def test_empty_ua(self):
        self.assertIsNone(match_bot("", BOT_SIGNATURES))

    def test_none_ua(self):
        self.assertIsNone(match_bot(None, BOT_SIGNATURES))

    def test_curl(self):
        self.assertIsNone(match_bot("curl/8.4.0", BOT_SIGNATURES))


class TestMatchReferrer(unittest.TestCase):

    def test_matches_chatgpt(self):
        self.assertEqual(match_referrer("chatgpt.com", AI_REFERRERS), "chatgpt.com")

    def test_matches_claude(self):
        self.assertEqual(match_referrer("claude.ai", AI_REFERRERS), "claude.ai")

    def test_matches_subdomain(self):
        self.assertIsNotNone(match_referrer("labs.perplexity.ai", AI_REFERRERS))

    def test_case_insensitive(self):
        self.assertEqual(match_referrer("ChatGPT.com", AI_REFERRERS), "chatgpt.com")

    def test_matches_deepseek(self):
        self.assertEqual(match_referrer("deepseek.com", AI_REFERRERS), "deepseek.com")

    def test_no_match_google(self):
        self.assertIsNone(match_referrer("google.com", AI_REFERRERS))

    def test_no_match_facebook(self):
        self.assertIsNone(match_referrer("facebook.com", AI_REFERRERS))

    def test_empty(self):
        self.assertIsNone(match_referrer("", AI_REFERRERS))

    def test_none(self):
        self.assertIsNone(match_referrer(None, AI_REFERRERS))


class TestFalsePositives(unittest.TestCase):

    NORMAL_UAS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Safari/604.1",
        "Wget/1.21",
        "PostmanRuntime/7.36.0",
        "python-requests/2.31.0",
    ]

    NORMAL_REFERRERS = [
        "google.com", "www.google.com", "facebook.com", "twitter.com",
        "t.co", "linkedin.com", "reddit.com", "youtube.com",
    ]

    def test_no_false_positive_bots(self):
        for ua in self.NORMAL_UAS:
            with self.subTest(ua=ua[:50]):
                self.assertIsNone(match_bot(ua, BOT_SIGNATURES))

    def test_no_false_positive_referrers(self):
        for ref in self.NORMAL_REFERRERS:
            with self.subTest(referrer=ref):
                self.assertIsNone(match_referrer(ref, AI_REFERRERS))


if __name__ == "__main__":
    unittest.main()
