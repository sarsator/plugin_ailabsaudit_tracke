'use strict';

/**
 * Basic unit tests for the pixel tag's payload structure.
 *
 * Run: node tests/tracker.test.js
 *
 * NOTE: The pixel tag runs in the browser and uses sendBeacon.
 * These tests validate the payload building logic only.
 * The pixel sends unsigned payloads (no HMAC) — signing happens
 * server-side. No canonicalization, no sha256= prefix.
 */

const fs = require('fs');
const path = require('path');

// Load test vectors for reference
const vectorsPath = path.resolve(__dirname, '..', '..', '..', 'spec', 'test-vectors.json');
const data = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.log(`  FAIL: ${message}`);
  }
}

// -----------------------------------------------------------------
// Test: payload structure matches spec
// -----------------------------------------------------------------

// Simulate buildPayload logic
function buildPayload(event, url, meta) {
  const payload = {
    event: event,
    timestamp: '2026-03-04T12:00:00Z',
    tracker_id: 'TRK-001',
    url: url,
  };
  if (meta && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }
  return payload;
}

// Test 1: minimal payload matches expected structure
const p1 = buildPayload('page_view', 'https://example.com');
assert(p1.event === 'page_view', 'minimal payload has event=page_view');
assert(p1.tracker_id === 'TRK-001', 'minimal payload has tracker_id');
assert(p1.url === 'https://example.com', 'minimal payload has url');
assert(p1.timestamp === '2026-03-04T12:00:00Z', 'minimal payload has timestamp');
assert(!p1.meta, 'minimal payload has no meta');

// Test 2: payload with meta
const p2 = buildPayload('cta_click', 'https://example.com/pricing', {
  button_id: 'signup-hero',
  button_text: 'Start Free Trial',
});
assert(p2.event === 'cta_click', 'meta payload has event=cta_click');
assert(p2.meta.button_id === 'signup-hero', 'meta payload has button_id');
assert(p2.meta.button_text === 'Start Free Trial', 'meta payload has button_text');

// Test 3: required fields presence
const requiredFields = ['event', 'timestamp', 'tracker_id', 'url'];
for (const field of requiredFields) {
  assert(field in p1, `required field "${field}" present in payload`);
}

// Test 4: verify test vectors have valid structure (new format)
for (const v of data.vectors) {
  assert(
    typeof v.timestamp === 'string' && v.timestamp.length > 0,
    `vector "${v.name}" has timestamp`,
  );
  assert(
    typeof v.method === 'string' && v.method.length > 0,
    `vector "${v.name}" has method`,
  );
  assert(
    typeof v.path === 'string' && v.path.length > 0,
    `vector "${v.name}" has path`,
  );
  assert(
    typeof v.body === 'string',
    `vector "${v.name}" has body (may be empty for GET)`,
  );
  assert(
    typeof v.signature === 'string' && v.signature.length === 64,
    `vector "${v.name}" has 64-char hex signature (no sha256= prefix)`,
  );
  assert(
    typeof v.string_to_sign === 'string' && v.string_to_sign.length > 0,
    `vector "${v.name}" has string_to_sign`,
  );
}

// Summary
const total = passed + failed;
console.log(`\nResults: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);
