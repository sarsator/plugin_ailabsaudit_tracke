"""
test_hmac.py — Validate canonicalize + sign against spec/test-vectors.json.

Run:  python -m pytest tests/test_hmac.py -v
  or: python tests/test_hmac.py
"""

import json
import os
import sys
import unittest

# Add src to path for direct execution.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from ailabsaudit_tracker.tracker import canonicalize, sign, signature_header  # noqa: E402


class TestHMAC(unittest.TestCase):
    """Test HMAC signing against the shared test vectors."""

    @classmethod
    def setUpClass(cls):
        vectors_path = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "spec", "test-vectors.json")
        )
        with open(vectors_path, "r") as fh:
            data = json.load(fh)
        cls.secret = data["secret"]
        cls.vectors = data["vectors"]

    def test_canonicalize(self):
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                result = canonicalize(v["payload"])
                self.assertEqual(result, v["canonical"])

    def test_sign(self):
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                canonical = canonicalize(v["payload"])
                result = sign(canonical, self.secret)
                self.assertEqual(result, v["signature"])

    def test_signature_header(self):
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                canonical = canonicalize(v["payload"])
                result = signature_header(canonical, self.secret)
                self.assertEqual(result, v["header"])

    def test_end_to_end(self):
        """Canonical form -> sign -> header in one pipeline."""
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                canonical = canonicalize(v["payload"])
                self.assertEqual(canonical, v["canonical"])
                self.assertEqual(sign(canonical, self.secret), v["signature"])
                self.assertEqual(signature_header(canonical, self.secret), v["header"])


if __name__ == "__main__":
    unittest.main()
