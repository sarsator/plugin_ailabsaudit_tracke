'use strict';

/**
 * Cross-collector list validation.
 *
 * Verifies that all 5 collectors have identical bot signatures
 * and AI referrer lists matching the canonical spec/default-lists.json.
 *
 * Run: node integration-tests/validate-lists.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}`);
    if (detail) console.log(`    ${detail}`);
  }
}

// -----------------------------------------------------------------
// Load canonical lists
// -----------------------------------------------------------------
const specPath = path.resolve(__dirname, '..', 'spec', 'default-lists.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const canonicalBots = spec.bot_signatures.slice().sort();
const canonicalRefs = spec.ai_referrers.slice().sort();

console.log(`\nCanonical: ${canonicalBots.length} bots, ${canonicalRefs.length} referrers\n`);

// -----------------------------------------------------------------
// Node.js
// -----------------------------------------------------------------
console.log('--- Node.js ---');
const nodeDefaults = require('../collectors/node/src/defaults');
const nodeBots = nodeDefaults.BOT_SIGNATURES.slice().sort();
const nodeRefs = nodeDefaults.AI_REFERRERS.slice().sort();

assert('Node bots count', nodeBots.length === canonicalBots.length,
  `expected ${canonicalBots.length}, got ${nodeBots.length}`);
assert('Node bots match', JSON.stringify(nodeBots) === JSON.stringify(canonicalBots),
  findDiff(canonicalBots, nodeBots));
assert('Node refs count', nodeRefs.length === canonicalRefs.length,
  `expected ${canonicalRefs.length}, got ${nodeRefs.length}`);
assert('Node refs match', JSON.stringify(nodeRefs) === JSON.stringify(canonicalRefs),
  findDiff(canonicalRefs, nodeRefs));

// -----------------------------------------------------------------
// Cloudflare Worker (read file as text, parse export)
// -----------------------------------------------------------------
console.log('\n--- Cloudflare Worker ---');
const cfDefaultsPath = path.resolve(__dirname, '..', 'collectors', 'cloudflare-worker', 'src', 'defaults.js');
const cfContent = fs.readFileSync(cfDefaultsPath, 'utf8');

const cfBots = extractArray(cfContent, 'BOT_SIGNATURES');
const cfRefs = extractArray(cfContent, 'AI_REFERRERS');

assert('CF bots count', cfBots.length === canonicalBots.length,
  `expected ${canonicalBots.length}, got ${cfBots.length}`);
assert('CF bots match', JSON.stringify(cfBots.sort()) === JSON.stringify(canonicalBots),
  findDiff(canonicalBots, cfBots.sort()));
assert('CF refs count', cfRefs.length === canonicalRefs.length,
  `expected ${canonicalRefs.length}, got ${cfRefs.length}`);
assert('CF refs match', JSON.stringify(cfRefs.sort()) === JSON.stringify(canonicalRefs),
  findDiff(canonicalRefs, cfRefs.sort()));

// -----------------------------------------------------------------
// Python (parse Python list from file)
// -----------------------------------------------------------------
console.log('\n--- Python ---');
const pyDefaultsPath = path.resolve(__dirname, '..', 'collectors', 'python', 'src', 'ailabsaudit_tracker', 'defaults.py');
const pyContent = fs.readFileSync(pyDefaultsPath, 'utf8');

const pyBots = extractPythonList(pyContent, 'BOT_SIGNATURES');
const pyRefs = extractPythonList(pyContent, 'AI_REFERRERS');

assert('Python bots count', pyBots.length === canonicalBots.length,
  `expected ${canonicalBots.length}, got ${pyBots.length}`);
assert('Python bots match', JSON.stringify(pyBots.sort()) === JSON.stringify(canonicalBots),
  findDiff(canonicalBots, pyBots.sort()));
assert('Python refs count', pyRefs.length === canonicalRefs.length,
  `expected ${canonicalRefs.length}, got ${pyRefs.length}`);
assert('Python refs match', JSON.stringify(pyRefs.sort()) === JSON.stringify(canonicalRefs),
  findDiff(canonicalRefs, pyRefs.sort()));

// -----------------------------------------------------------------
// PHP (parse PHP array from file)
// -----------------------------------------------------------------
console.log('\n--- PHP ---');
const phpDefaultsPath = path.resolve(__dirname, '..', 'collectors', 'php', 'src', 'Defaults.php');
const phpContent = fs.readFileSync(phpDefaultsPath, 'utf8');

const phpBots = extractPhpArray(phpContent, 'botSignatures');
const phpRefs = extractPhpArray(phpContent, 'aiReferrers');

assert('PHP bots count', phpBots.length === canonicalBots.length,
  `expected ${canonicalBots.length}, got ${phpBots.length}`);
assert('PHP bots match', JSON.stringify(phpBots.sort()) === JSON.stringify(canonicalBots),
  findDiff(canonicalBots, phpBots.sort()));
assert('PHP refs count', phpRefs.length === canonicalRefs.length,
  `expected ${canonicalRefs.length}, got ${phpRefs.length}`);
assert('PHP refs match', JSON.stringify(phpRefs.sort()) === JSON.stringify(canonicalRefs),
  findDiff(canonicalRefs, phpRefs.sort()));

// -----------------------------------------------------------------
// WordPress (parse PHP array from cache file)
// -----------------------------------------------------------------
console.log('\n--- WordPress ---');
const wpCachePath = path.resolve(__dirname, '..', 'collectors', 'wordpress', 'includes', 'class-ailabsaudit-cache.php');
const wpContent = fs.readFileSync(wpCachePath, 'utf8');

const wpBots = extractPhpArray(wpContent, 'get_default_bot_signatures');
const wpRefs = extractPhpArray(wpContent, 'get_default_ai_referrers');

assert('WordPress bots count', wpBots.length === canonicalBots.length,
  `expected ${canonicalBots.length}, got ${wpBots.length}`);
assert('WordPress bots match', JSON.stringify(wpBots.sort()) === JSON.stringify(canonicalBots),
  findDiff(canonicalBots, wpBots.sort()));
assert('WordPress refs count', wpRefs.length === canonicalRefs.length,
  `expected ${canonicalRefs.length}, got ${wpRefs.length}`);
assert('WordPress refs match', JSON.stringify(wpRefs.sort()) === JSON.stringify(canonicalRefs),
  findDiff(canonicalRefs, wpRefs.sort()));

// -----------------------------------------------------------------
// Results
// -----------------------------------------------------------------
const total = passed + failed;
console.log(`\nResults: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function extractArray(content, varName) {
  // Extract JS array from ESM or CJS export.
  const regex = new RegExp(`(?:const|export const|let|var)\\s+${varName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const match = content.match(regex);
  if (!match) return [];
  return match[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
}

function extractPythonList(content, varName) {
  const regex = new RegExp(`${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const match = content.match(regex);
  if (!match) return [];
  return match[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ''));
}

function extractPhpArray(content, funcName) {
  // Find the function/method body containing the return array.
  const regex = new RegExp(`function\\s+${funcName}[^{]*\\{[\\s\\S]*?return\\s+(?:array\\(|\\[)([\\s\\S]*?)(?:\\)|\\]);`, 'm');
  const match = content.match(regex);
  if (!match) return [];
  return match[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
}

function findDiff(expected, actual) {
  const missing = expected.filter((x) => !actual.includes(x));
  const extra = actual.filter((x) => !expected.includes(x));
  const parts = [];
  if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
  if (extra.length) parts.push(`extra: ${extra.join(', ')}`);
  return parts.join('; ') || 'unknown diff';
}
