'use strict';

/**
 * Functional tests for Cloudflare Worker bot/referrer detection.
 *
 * Tests detection logic against dynamic lists loaded from defaults.js.
 *
 * Run: node tests/detection.test.js
 */

const fs = require('fs');
const path = require('path');

// Load lists from defaults.js (ESM file — parse as text).
const defaultsSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'defaults.js'),
  'utf8'
);

// Extract BOT_SIGNATURES array.
const botMatch = defaultsSrc.match(/export const BOT_SIGNATURES = \[([\s\S]*?)\];/);
const botSignatures = botMatch[1]
  .split('\n')
  .map(line => line.replace(/\/\/.*$/, '').trim())
  .join('')
  .split(',')
  .map(s => s.replace(/['"]/g, '').trim())
  .filter(Boolean);

// Extract AI_REFERRERS array.
const refMatch = defaultsSrc.match(/export const AI_REFERRERS = \[([\s\S]*?)\];/);
const aiReferrers = refMatch[1]
  .split('\n')
  .map(line => line.replace(/\/\/.*$/, '').trim())
  .join('')
  .split(',')
  .map(s => s.replace(/['"]/g, '').trim())
  .filter(Boolean);

console.log(`Bot signatures loaded: ${botSignatures.length}`);
console.log(`AI referrers loaded: ${aiReferrers.length}\n`);

let pass = 0;
let fail = 0;

function matchBot(ua) {
  const uaLower = ua.toLowerCase();
  for (const sig of botSignatures) {
    if (uaLower.includes(sig.toLowerCase())) return sig;
  }
  return null;
}

function matchReferrer(hostname) {
  const host = hostname.toLowerCase();
  for (const domain of aiReferrers) {
    const d = domain.toLowerCase();
    if (host === d || host.endsWith('.' + d)) return domain;
  }
  return null;
}

function assertMatch(label, result, shouldMatch = true) {
  if (shouldMatch && result !== null) {
    console.log(`  PASS: ${label} (matched: ${result})`);
    pass++;
  } else if (!shouldMatch && result === null) {
    console.log(`  PASS: ${label} (no match, as expected)`);
    pass++;
  } else {
    console.log(`  FAIL: ${label} (got: ${result})`);
    fail++;
  }
}

// -----------------------------------------------------------------
// Bot detection tests
// -----------------------------------------------------------------
console.log('=== Bot Detection Tests ===');

const botTests = {
  'GPTBot': 'Mozilla/5.0 (compatible; GPTBot/1.3; +https://openai.com/gptbot)',
  'ChatGPT-User': 'Mozilla/5.0 (compatible; ChatGPT-User/1.0)',
  'OAI-SearchBot': 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0)',
  'ChatGPT-Browser': 'Mozilla/5.0 (compatible; ChatGPT-Browser/1.0)',
  'Operator': 'Mozilla/5.0 (compatible; Operator/1.0)',
  'ClaudeBot': 'ClaudeBot/1.0; +https://www.anthropic.com',
  'Claude-Web': 'Mozilla/5.0 (compatible; Claude-Web/1.0)',
  'Claude-User': 'Mozilla/5.0 (compatible; Claude-User/1.0)',
  'Anthropic-Claude': 'Mozilla/5.0 (compatible; Anthropic-Claude/1.0)',
  'Google-Extended': 'Mozilla/5.0 (compatible; Google-Extended/1.0)',
  'GoogleAgent-Mariner': 'Mozilla/5.0 (compatible; GoogleAgent-Mariner/1.0)',
  'Gemini-Deep-Research': 'Mozilla/5.0 (compatible; Gemini-Deep-Research/1.0)',
  'Google-NotebookLM': 'Mozilla/5.0 (compatible; Google-NotebookLM/1.0)',
  'PerplexityBot': 'PerplexityBot/1.0',
  'Perplexity-User': 'Perplexity-User/1.0',
  'Meta-WebIndexer': 'Mozilla/5.0 (compatible; Meta-WebIndexer/1.1)',
  'bingbot': 'Mozilla/5.0 (compatible; bingbot/2.0)',
  'AzureAI-SearchBot': 'Mozilla/5.0 (compatible; AzureAI-SearchBot/1.0)',
  'TikTokSpider': 'Mozilla/5.0 (compatible; TikTokSpider/1.0)',
  'GrokBot': 'GrokBot/1.0',
  'xAI-Grok': 'xAI-Grok/1.0',
  'Grok-DeepSearch': 'Grok-DeepSearch/1.0',
  'Amzn-SearchBot': 'Mozilla/5.0 (compatible; Amzn-SearchBot/1.0)',
  'NovaAct': 'Mozilla/5.0 (compatible; NovaAct/1.0)',
  'DeepSeekBot': 'Mozilla/5.0 (compatible; DeepSeekBot/1.0)',
  'MistralAI-User': 'MistralAI-User/1.0',
  'ChatGLM-Spider': 'Mozilla/5.0 (compatible; ChatGLM-Spider/1.0)',
  'PanguBot': 'Mozilla/5.0 (compatible; PanguBot/1.0)',
  'AI2Bot': 'Mozilla/5.0 (compatible; AI2Bot/1.0)',
  'Ai2Bot-Dolma': 'Mozilla/5.0 (compatible; Ai2Bot-Dolma/1.0)',
  'Bravebot': 'Mozilla/5.0 (compatible; Bravebot/1.0)',
  'PhindBot': 'Mozilla/5.0 (compatible; PhindBot/1.0)',
  'LinerBot': 'Mozilla/5.0 (compatible; LinerBot/1.0)',
  'TavilyBot': 'Mozilla/5.0 (compatible; TavilyBot/1.0)',
  'Kangaroo Bot': 'Mozilla/5.0 (compatible; Kangaroo Bot/1.0)',
  'Manus-User': 'Mozilla/5.0 (compatible; Manus-User/1.0)',
  'kagi-fetcher': 'Mozilla/5.0 (compatible; kagi-fetcher/1.0)',
  'Cloudflare-AutoRAG': 'Cloudflare-AutoRAG/1.0',
  'Firecrawl': 'Mozilla/5.0 (compatible; Firecrawl/1.0)',
  'Jina': 'Mozilla/5.0 (compatible; Jina/1.0)',
  'LinkedInBot': 'LinkedInBot/1.0',
  'cohere-training-data-crawler': 'cohere-training-data-crawler/1.0',
};

for (const [label, ua] of Object.entries(botTests)) {
  assertMatch(`Bot: ${label}`, matchBot(ua));
}

// Negative tests.
console.log('\n=== False Positive Tests ===');

const negativeBotTests = {
  'Normal Chrome': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
  'Normal Firefox': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'curl': 'curl/8.4.0',
};

for (const [label, ua] of Object.entries(negativeBotTests)) {
  assertMatch(`NoBot: ${label}`, matchBot(ua), false);
}

// -----------------------------------------------------------------
// Referrer detection tests
// -----------------------------------------------------------------
console.log('\n=== Referrer Detection Tests ===');

const referrerTests = [
  'chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'labs.perplexity.ai',
  'claude.ai', 'gemini.google.com', 'aistudio.google.com', 'notebooklm.google.com',
  'copilot.microsoft.com', 'copilot.cloud.microsoft',
  'grok.x.ai', 'grok.com', 'meta.ai', 'deepseek.com', 'chat.deepseek.com',
  'chat.mistral.ai', 'poe.com', 'you.com', 'phind.com', 'kagi.com',
  'brave.com', 'search.brave.com', 'character.ai',
  'huggingface.co', 'huggingchat.co', 'getliner.com', 'liner.com',
];

for (const domain of referrerTests) {
  assertMatch(`Ref: ${domain}`, matchReferrer(domain));
}

// Subdomain match.
assertMatch('Ref: sub.chatgpt.com', matchReferrer('sub.chatgpt.com'));

// Negative.
console.log('\n=== Referrer False Positive Tests ===');

const negativeRefTests = ['google.com', 'facebook.com', 'twitter.com', 'example.com'];
for (const domain of negativeRefTests) {
  assertMatch(`NoRef: ${domain}`, matchReferrer(domain), false);
}

// -----------------------------------------------------------------
// Summary
// -----------------------------------------------------------------
const total = pass + fail;
console.log(`\nResults: ${pass}/${total} passed${fail > 0 ? ` (${fail} FAILED)` : ''}`);
process.exit(fail > 0 ? 1 : 0);
