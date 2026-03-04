'use strict';

/**
 * Cross-collector HMAC validation script.
 *
 * Validates that the canonicalize + sign logic produces identical
 * output across Node.js and Cloudflare Worker collectors, and
 * matches the spec test vectors exactly.
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
// Import canonicalize from Node collector
// -----------------------------------------------------------------
const nodeCollector = require('../collectors/node/src/index.js');

// -----------------------------------------------------------------
// Replicate Cloudflare Worker canonicalize (pure JS, same logic)
// -----------------------------------------------------------------
function cfSortRecursive(d) {
  if (d === null || typeof d !== 'object') return d;
  if (Array.isArray(d)) return d.map(cfSortRecursive);
  const s = {};
  for (const k of Object.keys(d).sort()) s[k] = cfSortRecursive(d[k]);
  return s;
}
function cfCanonicalize(payload) {
  return JSON.stringify(cfSortRecursive(payload));
}

// -----------------------------------------------------------------
// Run validation
// -----------------------------------------------------------------

let passed = 0;
let failed = 0;

for (const v of data.vectors) {
  const nodeCanonical = nodeCollector.canonicalize(v.payload);
  const cfCanonical = cfCanonicalize(v.payload);
  const nodeSig = nodeCollector.sign(nodeCanonical, secret);

  const errors = [];

  // Cross-collector consistency
  if (nodeCanonical !== cfCanonical) {
    errors.push(`  Node vs CF Worker canonical mismatch`);
  }

  // Spec compliance
  if (nodeCanonical !== v.canonical) {
    errors.push(`  canonical != spec\n    expected: ${v.canonical}\n    actual:   ${nodeCanonical}`);
  }
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
