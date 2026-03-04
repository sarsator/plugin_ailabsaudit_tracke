'use strict';

/**
 * Detection tests — matchBot, matchReferrer, middleware.
 *
 * Run: node tests/detection.test.js
 */

const { matchBot, matchReferrer } = require('../src/detector');
const { BOT_SIGNATURES, AI_REFERRERS } = require('../src/defaults');

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}`);
  }
}

// -----------------------------------------------------------------
// matchBot
// -----------------------------------------------------------------
console.log('\n--- matchBot ---');

assert('detects GPTBot',
  matchBot('Mozilla/5.0 (compatible; GPTBot/1.0)', BOT_SIGNATURES) === 'GPTBot');

assert('detects ClaudeBot',
  matchBot('ClaudeBot/1.0', BOT_SIGNATURES) === 'ClaudeBot');

assert('detects case-insensitive',
  matchBot('mozilla/5.0 gptbot/1.0', BOT_SIGNATURES) === 'GPTBot');

assert('detects PerplexityBot',
  matchBot('Mozilla/5.0 PerplexityBot/1.0', BOT_SIGNATURES) === 'PerplexityBot');

assert('detects DeepSeekBot',
  matchBot('DeepSeekBot/1.0', BOT_SIGNATURES) === 'DeepSeekBot');

assert('detects bingbot',
  matchBot('Mozilla/5.0 (compatible; bingbot/2.0)', BOT_SIGNATURES) === 'bingbot');

assert('detects Googlebot',
  matchBot('Googlebot/2.1 (+http://www.google.com/bot.html)', BOT_SIGNATURES) === 'Googlebot');

assert('returns null for Chrome',
  matchBot('Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36', BOT_SIGNATURES) === null);

assert('returns null for Firefox',
  matchBot('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', BOT_SIGNATURES) === null);

assert('returns null for empty UA',
  matchBot('', BOT_SIGNATURES) === null);

assert('returns null for null',
  matchBot(null, BOT_SIGNATURES) === null);

assert('returns null for curl',
  matchBot('curl/8.4.0', BOT_SIGNATURES) === null);

// -----------------------------------------------------------------
// matchReferrer
// -----------------------------------------------------------------
console.log('\n--- matchReferrer ---');

assert('matches chatgpt.com',
  matchReferrer('chatgpt.com', AI_REFERRERS) === 'chatgpt.com');

assert('matches claude.ai',
  matchReferrer('claude.ai', AI_REFERRERS) === 'claude.ai');

assert('matches subdomain of perplexity.ai',
  matchReferrer('labs.perplexity.ai', AI_REFERRERS) !== null);

assert('matches case-insensitive',
  matchReferrer('ChatGPT.com', AI_REFERRERS) === 'chatgpt.com');

assert('matches deepseek.com',
  matchReferrer('deepseek.com', AI_REFERRERS) === 'deepseek.com');

assert('returns null for google.com',
  matchReferrer('google.com', AI_REFERRERS) === null);

assert('returns null for facebook.com',
  matchReferrer('facebook.com', AI_REFERRERS) === null);

assert('returns null for empty',
  matchReferrer('', AI_REFERRERS) === null);

assert('returns null for null',
  matchReferrer(null, AI_REFERRERS) === null);

// -----------------------------------------------------------------
// False positive checks
// -----------------------------------------------------------------
console.log('\n--- False positives ---');

const normalUAs = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Wget/1.21',
  'PostmanRuntime/7.36.0',
  'python-requests/2.31.0',
];

for (const ua of normalUAs) {
  assert(`no false positive: ${ua.substring(0, 50)}...`,
    matchBot(ua, BOT_SIGNATURES) === null);
}

const normalReferrers = [
  'google.com', 'www.google.com', 'facebook.com', 'twitter.com',
  't.co', 'linkedin.com', 'reddit.com', 'youtube.com',
];

for (const ref of normalReferrers) {
  assert(`no false positive referrer: ${ref}`,
    matchReferrer(ref, AI_REFERRERS) === null);
}

// -----------------------------------------------------------------
// Results
// -----------------------------------------------------------------
const total = passed + failed;
console.log(`\nResults: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);
