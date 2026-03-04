#!/usr/bin/env bash
#
# integration-tests/run-all.sh
#
# Cross-collector HMAC validation against spec/test-vectors.json.
# Runs each collector's test suite and reports aggregate results.
#
# Usage: bash integration-tests/run-all.sh
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASSED=0
FAILED=0
SKIPPED=0

header() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

run_test() {
  local name="$1"
  local cmd="$2"

  header "$name"

  if eval "$cmd"; then
    PASSED=$((PASSED + 1))
    echo "  => $name: OK"
  else
    FAILED=$((FAILED + 1))
    echo "  => $name: FAILED"
  fi
}

skip_test() {
  local name="$1"
  local reason="$2"

  header "$name"
  echo "  SKIPPED: $reason"
  SKIPPED=$((SKIPPED + 1))
}

# -----------------------------------------------------------------
# Node.js collector
# -----------------------------------------------------------------
if command -v node &>/dev/null; then
  run_test "Node.js collector" "node '$ROOT/collectors/node/tests/hmac.test.js'"
else
  skip_test "Node.js collector" "node not found"
fi

# -----------------------------------------------------------------
# Cloudflare Worker collector
# -----------------------------------------------------------------
if command -v node &>/dev/null; then
  run_test "Cloudflare Worker collector" "node '$ROOT/collectors/cloudflare-worker/tests/hmac.test.js'"
else
  skip_test "Cloudflare Worker collector" "node not found"
fi

# -----------------------------------------------------------------
# JavaScript Pixel tag
# -----------------------------------------------------------------
if command -v node &>/dev/null; then
  run_test "JavaScript Pixel tag" "node '$ROOT/collectors/pixel/tests/tracker.test.js'"
else
  skip_test "JavaScript Pixel tag" "node not found"
fi

# -----------------------------------------------------------------
# Python collector
# -----------------------------------------------------------------
if command -v python3 &>/dev/null; then
  run_test "Python collector" "python3 '$ROOT/collectors/python/tests/test_hmac.py'"
else
  skip_test "Python collector" "python3 not found"
fi

# -----------------------------------------------------------------
# PHP collector
# -----------------------------------------------------------------
if command -v php &>/dev/null; then
  run_test "PHP collector" "php '$ROOT/collectors/php/tests/HmacTest.php'"
else
  skip_test "PHP collector" "php not found"
fi

# -----------------------------------------------------------------
# WordPress collector (PHPUnit)
# -----------------------------------------------------------------
if command -v php &>/dev/null; then
  run_test "WordPress Signer" "php -r \"
    define('ABSPATH', '/tmp/');
    function wp_json_encode(\\\$d, \\\$o=0, \\\$dp=512) { return json_encode(\\\$d, \\\$o, \\\$dp); }
    require '$ROOT/collectors/wordpress/includes/class-ailabsaudit-signer.php';
    \\\$s = new AiLabsAudit_Signer();
    \\\$secret = 'whsec_test_secret_key_for_ailabsaudit_tracker';
    \\\$p = ['url'=>'https://example.com','event'=>'page_view','tracker_id'=>'TRK-001','timestamp'=>'2026-03-04T12:00:00Z'];
    \\\$c = \\\$s->canonicalize(\\\$p);
    \\\$sig = \\\$s->sign(\\\$c, \\\$secret);
    if (\\\$sig !== '38a1f33bab70b46143c0a9528640be0fee83a9ddcbb94395018460f6b81394ce') { echo 'FAIL'; exit(1); }
    echo '  PASS: wordpress signer';
  \""
else
  skip_test "WordPress Signer" "php not found"
fi

# -----------------------------------------------------------------
# Summary
# -----------------------------------------------------------------
echo ""
echo "================================================================"
echo "  INTEGRATION TEST SUMMARY"
echo "================================================================"
echo "  Passed:  $PASSED"
echo "  Failed:  $FAILED"
echo "  Skipped: $SKIPPED"
echo "================================================================"

exit $FAILED
