#!/usr/bin/env python3
"""
Cross-collector HMAC validation — Python side.

Validates that the Python collector's sign matches the spec test
vectors exactly.

New format: "{timestamp}\\n{method}\\n{path}\\n{body}"
Signature is raw hex (no sha256= prefix). No canonicalization.

Run: python3 integration-tests/validate-vectors.py
"""

import json
import os
import sys

# Add Python collector to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'collectors', 'python', 'src'))

from ailabsaudit_tracker.tracker import sign, signature_header  # noqa: E402

vectors_path = os.path.join(os.path.dirname(__file__), '..', 'spec', 'test-vectors.json')
with open(vectors_path) as f:
    data = json.load(f)

secret = data['secret']
passed = 0
failed = 0

for v in data['vectors']:
    sig = sign(v['timestamp'], v['method'], v['path'], v['body'], secret)
    header = signature_header(v['timestamp'], v['method'], v['path'], v['body'], secret)
    errors = []

    if sig != v['signature']:
        errors.append(f"  signature mismatch\n    expected: {v['signature']}\n    actual:   {sig}")
    if header != v['signature']:
        errors.append(f"  header mismatch\n    expected: {v['signature']}\n    actual:   {header}")

    if errors:
        failed += 1
        print(f"  FAIL: {v['name']}")
        for e in errors:
            print(e)
    else:
        passed += 1
        print(f"  PASS: {v['name']}")

total = len(data['vectors'])
suffix = f", {failed} FAILED" if failed > 0 else ""
print(f"\nResults: {passed}/{total} passed{suffix}")
sys.exit(1 if failed > 0 else 0)
