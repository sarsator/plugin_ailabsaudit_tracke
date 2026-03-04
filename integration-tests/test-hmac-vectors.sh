#!/usr/bin/env bash
#
# integration-tests/test-hmac-vectors.sh
#
# Cross-language HMAC consistency check using openssl dgst as the
# reference implementation. Reads spec/test-vectors.json and verifies
# that each vector's canonical payload produces the expected signature.
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

# Extract secret
SECRET=$(python3 -c "import json; print(json.load(open('$VECTORS_FILE'))['secret'])")

# Count vectors
COUNT=$(python3 -c "import json; print(len(json.load(open('$VECTORS_FILE'))['vectors']))")

PASSED=0
FAILED=0

for i in $(seq 0 $((COUNT - 1))); do
  # Extract vector fields via python (portable JSON parsing)
  NAME=$(python3 -c "import json; v=json.load(open('$VECTORS_FILE'))['vectors'][$i]; print(v['name'])")
  CANONICAL=$(python3 -c "import json; v=json.load(open('$VECTORS_FILE'))['vectors'][$i]; print(v['canonical'])")
  EXPECTED_SIG=$(python3 -c "import json; v=json.load(open('$VECTORS_FILE'))['vectors'][$i]; print(v['signature'])")

  # Compute HMAC-SHA256 using openssl as reference
  ACTUAL_SIG=$(printf '%s' "$CANONICAL" | openssl dgst -sha256 -hmac "$SECRET" -hex 2>/dev/null | sed 's/^.* //')

  if [ "$ACTUAL_SIG" = "$EXPECTED_SIG" ]; then
    echo "  PASS: $NAME (openssl reference)"
    PASSED=$((PASSED + 1))
  else
    echo "  FAIL: $NAME"
    echo "    expected: $EXPECTED_SIG"
    echo "    actual:   $ACTUAL_SIG"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Results: $PASSED/$COUNT passed (openssl dgst reference)${FAILED:+, $FAILED FAILED}"

# Now verify cross-language consistency if node and python are available
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

exit $FAILED
