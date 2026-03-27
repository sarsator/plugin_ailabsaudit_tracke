'use strict';

/**
 * Cross-collector HMAC validation script.
 *
 * Validates that the HMAC signing logic matches the spec test vectors.
 * Uses Node.js crypto to replicate the signing format used by all collectors.
 *
 * Format: "{timestamp}\n{method}\n{path}\n{body}"
 * Signature is raw hex (no sha256= prefix). No canonicalization.
 *
 * Run: node integration-tests/validate-vectors.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load test vectors.
const vectorsPath = path.resolve(__dirname, '..', 'spec', 'test-vectors.json');
const data = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
const secret = data.secret;

/**
 * HMAC-SHA256 sign — same logic as all collectors.
 */
function sign(timestamp, method, pathStr, body, secret) {
  const stringToSign = `${timestamp}\n${method}\n${pathStr}\n${body}`;
  return crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');
}

let passed = 0;
let failed = 0;

for (const v of data.vectors) {
  const sig = sign(v.timestamp, v.method, v.path, v.body, secret);
  const errors = [];

  if (sig !== v.signature) {
    errors.push(`  signature mismatch\n    expected: ${v.signature}\n    actual:   ${sig}`);
  }

  if (errors.length > 0) {
    failed++;
    console.log(`  FAIL: ${v.name}`);
    errors.forEach((e) => console.log(e));
  } else {
    passed++;
    console.log(`  PASS: ${v.name}`);
  }
}

const total = data.vectors.length;
console.log(`\nResults: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);
