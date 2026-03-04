'use strict';

/**
 * HMAC Test — validates canonicalize + sign against spec/test-vectors.json.
 *
 * Run:  node tests/hmac.test.js
 * Exit: 0 = all pass, 1 = failure.
 */

const fs = require('fs');
const path = require('path');
const { canonicalize, sign, signatureHeader } = require('../src/index');

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
