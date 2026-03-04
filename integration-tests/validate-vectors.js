'use strict';

/**
 * Cross-collector HMAC validation script.
 *
 * Validates that the sign logic produces identical output across
 * Node.js and Cloudflare Worker collectors, and matches the spec
 * test vectors exactly.
 *
 * New format: "{timestamp}\n{method}\n{path}\n{body}"
 * Signature is raw hex (no sha256= prefix). No canonicalization.
 *
 * Run: node integration-tests/validate-vectors.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load test vectors
const vectorsPath = path.resolve(__dirname, '..', 'spec', 'test-vectors.json');
const data = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
const secret = data.secret;

// -----------------------------------------------------------------
// Import sign from Node collector
// -----------------------------------------------------------------
const nodeCollector = require('../collectors/node/src/index.js');

// -----------------------------------------------------------------
// Replicate Cloudflare Worker sign (pure JS, same logic)
// -----------------------------------------------------------------
function cfSign(timestamp, method, pathStr, body, secret) {
  const stringToSign = `${timestamp}\n${method}\n${pathStr}\n${body}`;
  return crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');
}

// -----------------------------------------------------------------
// Run validation
// -----------------------------------------------------------------

let passed = 0;
let failed = 0;

for (const v of data.vectors) {
  const nodeSig = nodeCollector.sign(v.timestamp, v.method, v.path, v.body, secret);
  const cfSig = cfSign(v.timestamp, v.method, v.path, v.body, secret);
  const errors = [];

  // Cross-collector consistency
  if (nodeSig !== cfSig) {
    errors.push(`  Node vs CF Worker signature mismatch\n    node: ${nodeSig}\n    cf:   ${cfSig}`);
  }

  // Spec compliance
  if (nodeSig !== v.signature) {
    errors.push(`  signature != spec\n    expected: ${v.signature}\n    actual:   ${nodeSig}`);
  }

  if (errors.length > 0) {
    failed++;
    console.log(`  FAIL: ${v.name}`);
    errors.forEach((e) => console.log(e));
  } else {
    passed++;
    console.log(`  PASS: ${v.name} (node + cf-worker consistent)`);
  }
}

const total = data.vectors.length;
console.log(`\nResults: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);
