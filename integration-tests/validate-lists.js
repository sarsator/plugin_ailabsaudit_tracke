'use strict';

/**
 * Cross-collector list validation.
 *
 * Verifies that all collectors have identical bot signatures
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
// Go Log Agent (parse Go slice from defaults.go)
// -----------------------------------------------------------------
console.log('--- Go Log Agent ---');
const goDefaultsPath = path.resolve(__dirname, '..', 'collectors', 'log-agent', 'defaults.go');
const goContent = fs.readFileSync(goDefaultsPath, 'utf8');

const goBots = extractGoSlice(goContent, 'botSignatures');
const goRefs = extractGoSlice(goContent, 'aiReferrers');

assert('Go bots count', goBots.length === canonicalBots.length,
  `expected ${canonicalBots.length}, got ${goBots.length}`);
assert('Go bots match', JSON.stringify(goBots.sort()) === JSON.stringify(canonicalBots),
  findDiff(canonicalBots, goBots.sort()));
assert('Go refs count', goRefs.length === canonicalRefs.length,
  `expected ${canonicalRefs.length}, got ${goRefs.length}`);
assert('Go refs match', JSON.stringify(goRefs.sort()) === JSON.stringify(canonicalRefs),
  findDiff(canonicalRefs, goRefs.sort()));

// -----------------------------------------------------------------
// Cloudflare Worker (read file as text, parse export)
// -----------------------------------------------------------------
console.log('\n--- Cloudflare Worker ---');
const cfDefaultsPath = path.resolve(__dirname, '..', 'collectors', 'cloudflare-worker', 'src', 'defaults.js');
const cfContent = fs.readFileSync(cfDefaultsPath, 'utf8');

const cfBots = extractJsArray(cfContent, 'BOT_SIGNATURES');
const cfRefs = extractJsArray(cfContent, 'AI_REFERRERS');

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

function extractJsArray(content, varName) {
  const regex = new RegExp(`(?:const|export const|let|var)\\s+${varName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const match = content.match(regex);
  if (!match) return [];
  return match[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
}

function extractGoSlice(content, varName) {
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*\\[\\]string\\{([\\s\\S]*?)\\}`);
  const match = content.match(regex);
  if (!match) return [];
  return match[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ''));
}

function extractPythonList(content, varName) {
  const regex = new RegExp(`${varName}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const match = content.match(regex);
  if (!match) return [];
  return match[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ''));
}

function extractPhpArray(content, funcName) {
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
