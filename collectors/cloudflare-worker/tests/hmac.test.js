'use strict';

/**
 * HMAC Test for Cloudflare Worker collector.
 *
 * Uses Node.js crypto to simulate Web Crypto API behavior.
 * Validates sign() against spec/test-vectors.json.
 *
 * New format: "{timestamp}\n{method}\n{path}\n{body}"
 * Signature is raw hex (no sha256= prefix).
 * No canonicalization — body is signed as-is.
 *
 * Run: node tests/hmac.test.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Replicate the worker sign logic using Node.js crypto.
// The worker uses Web Crypto API but the signing logic is identical.

function sign(timestamp, method, pathStr, body, secret) {
  const stringToSign = `${timestamp}\n${method}\n${pathStr}\n${body}`;
  return crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');
}

function signatureHeader(timestamp, method, pathStr, body, secret) {
  return sign(timestamp, method, pathStr, body, secret);
}

// -----------------------------------------------------------------
// Load test vectors and run
// -----------------------------------------------------------------

const vectorsPath = path.resolve(__dirname, '..', '..', '..', 'spec', 'test-vectors.json');
const data = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

const secret = data.secret;
const vectors = data.vectors;
let passed = 0;
let failed = 0;

for (const v of vectors) {
  const sig = sign(v.timestamp, v.method, v.path, v.body, secret);
  const header = signatureHeader(v.timestamp, v.method, v.path, v.body, secret);
  const errors = [];

  if (sig !== v.signature) {
    errors.push(`  signature mismatch\n    expected: ${v.signature}\n    actual:   ${sig}`);
  }
  if (header !== v.signature) {
    errors.push(`  header mismatch\n    expected: ${v.signature}\n    actual:   ${header}`);
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

const total = vectors.length;
console.log(`\nResults: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);
