'use strict';

/**
 * HMAC Test for Cloudflare Worker collector.
 *
 * Uses Node.js crypto to simulate Web Crypto API behavior,
 * validates canonicalize() against spec/test-vectors.json.
 *
 * Run: node tests/hmac.test.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// We can't import ES modules directly, so we replicate the pure functions
// (they're identical to the worker source). The worker uses Web Crypto
// but canonicalize/sortRecursive are plain JS.

function sortRecursive(data) {
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sortRecursive);
  const sorted = {};
  for (const key of Object.keys(data).sort()) {
    sorted[key] = sortRecursive(data[key]);
  }
  return sorted;
}

function canonicalize(payload) {
  return JSON.stringify(sortRecursive(payload));
}

function sign(canonicalJson, secret) {
  return crypto.createHmac('sha256', secret).update(canonicalJson, 'utf8').digest('hex');
}

function signatureHeader(canonicalJson, secret) {
  return 'sha256=' + sign(canonicalJson, secret);
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
  const canonical = canonicalize(v.payload);
  const sig = sign(canonical, secret);
  const header = signatureHeader(canonical, secret);
  const errors = [];

  if (canonical !== v.canonical) {
    errors.push(`  canonical mismatch\n    expected: ${v.canonical}\n    actual:   ${canonical}`);
  }
  if (sig !== v.signature) {
    errors.push(`  signature mismatch\n    expected: ${v.signature}\n    actual:   ${sig}`);
  }
  if (header !== v.header) {
    errors.push(`  header mismatch\n    expected: ${v.header}\n    actual:   ${header}`);
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
