"""
test_hmac.py — Validate sign against spec/test-vectors.json.

New format: "{timestamp}\\n{method}\\n{path}\\n{body}"
Signature is raw hex (no sha256= prefix).
No canonicalization — body is signed as-is.

Run:  python -m pytest tests/test_hmac.py -v
  or: python tests/test_hmac.py
"""

import json
import os
import sys
import unittest

# Add src to path for direct execution.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from ailabsaudit_tracker.tracker import sign, signature_header  # noqa: E402


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

    def test_sign(self):
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                result = sign(v["timestamp"], v["method"], v["path"], v["body"], self.secret)
                self.assertEqual(result, v["signature"])

    def test_signature_header(self):
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                result = signature_header(v["timestamp"], v["method"], v["path"], v["body"], self.secret)
                self.assertEqual(result, v["signature"])

    def test_string_to_sign(self):
        """Verify the string-to-sign format matches the spec."""
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                expected_sts = f"{v['timestamp']}\n{v['method']}\n{v['path']}\n{v['body']}"
                self.assertEqual(expected_sts, v["string_to_sign"])

    def test_end_to_end(self):
        """sign -> header in one pipeline."""
        for v in self.vectors:
            with self.subTest(name=v["name"]):
                sig = sign(v["timestamp"], v["method"], v["path"], v["body"], self.secret)
                hdr = signature_header(v["timestamp"], v["method"], v["path"], v["body"], self.secret)
                self.assertEqual(sig, v["signature"])
                self.assertEqual(hdr, v["signature"])


if __name__ == "__main__":
    unittest.main()
