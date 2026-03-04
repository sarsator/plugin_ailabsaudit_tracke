#!/usr/bin/env bash
#
# integration-tests/test-hmac-vectors.sh
#
# Cross-language HMAC consistency check using openssl dgst as the
# reference implementation. Reads spec/test-vectors.json and verifies
# that each vector's string_to_sign produces the expected signature.
#
# Usage: bash integration-tests/test-hmac-vectors.sh
# Exit:  0 = all pass, 1 = at least one failure
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VECTORS_FILE="$ROOT/spec/test-vectors.json"

if [ ! -f "$VECTORS_FILE" ]; then
  echo "ERROR: $VECTORS_FILE not found"
  exit 1
fi

# Run the openssl reference check via Python to avoid bash $() newline truncation.
# Python writes string_to_sign bytes to openssl stdin without loss.
python3 -c "
import json, subprocess, sys

with open('$VECTORS_FILE') as f:
    data = json.load(f)

secret = data['secret']
passed = 0
failed = 0

for v in data['vectors']:
    sts = v['string_to_sign']
    expected = v['signature']
    proc = subprocess.run(
        ['openssl', 'dgst', '-sha256', '-hmac', secret, '-hex'],
        input=sts.encode('utf-8'),
        capture_output=True,
    )
    actual = proc.stdout.decode().strip().split(' ')[-1]
    if actual == expected:
        passed += 1
        print(f'  PASS: {v[\"name\"]} (openssl reference)')
    else:
        failed += 1
        print(f'  FAIL: {v[\"name\"]}')
        print(f'    expected: {expected}')
        print(f'    actual:   {actual}')

total = len(data['vectors'])
suffix = f', {failed} FAILED' if failed else ''
print(f'\nResults: {passed}/{total} passed (openssl dgst reference){suffix}')
sys.exit(failed)
" && OPENSSL_RESULT=0 || OPENSSL_RESULT=$?

# Now verify cross-language consistency if node and python are available.
echo ""
echo "--- Cross-language consistency ---"

if command -v node &>/dev/null; then
  echo "  Node.js:"
  node "$ROOT/integration-tests/validate-vectors.js"
fi

if command -v python3 &>/dev/null; then
  echo "  Python:"
  python3 "$ROOT/integration-tests/validate-vectors.py"
fi

exit "$OPENSSL_RESULT"
