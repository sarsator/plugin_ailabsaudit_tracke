#!/usr/bin/env python3
"""
Cross-collector HMAC validation — Python side.

Validates that the Python collector's canonicalize + sign matches
the spec test vectors exactly.

Run: python3 integration-tests/validate-vectors.py
"""

import json
import os
import sys

# Add Python collector to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'collectors', 'python', 'src'))

from ailabsaudit_tracker.tracker import canonicalize, sign, signature_header  # noqa: E402

vectors_path = os.path.join(os.path.dirname(__file__), '..', 'spec', 'test-vectors.json')
with open(vectors_path) as f:
    data = json.load(f)

secret = data['secret']
passed = 0
failed = 0

for v in data['vectors']:
    canonical = canonicalize(v['payload'])
    sig = sign(canonical, secret)
    header = signature_header(canonical, secret)
    errors = []

    if canonical != v['canonical']:
        errors.append(f"  canonical mismatch\n    expected: {v['canonical']}\n    actual:   {canonical}")
    if sig != v['signature']:
        errors.append(f"  signature mismatch\n    expected: {v['signature']}\n    actual:   {sig}")
    if header != v['header']:
        errors.append(f"  header mismatch\n    expected: {v['header']}\n    actual:   {header}")

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
