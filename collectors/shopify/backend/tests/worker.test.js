/**
 * Routing and detection. The variant must survive into the event: if H, B and
 * the control cannot be told apart in the data, the experiment measures nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyRelativePath, matchSignature } from '../src/worker.js';
import { sign, PLUGIN_TYPE } from '../src/tracker.js';

test('the proxy prefix is stripped whatever subpath the merchant chose', () => {
  assert.equal(proxyRelativePath('/apps/ailabs/agents.md'), '/agents.md');
  assert.equal(proxyRelativePath('/apps/anything-else/agents.md'), '/agents.md');
  assert.equal(proxyRelativePath('/apps/ailabs'), '/');
  assert.equal(proxyRelativePath('/agents.md'), '/agents.md');
});

test('a known crawler is matched, case-insensitively', () => {
  const sigs = ['GPTBot', 'ClaudeBot'];
  assert.equal(matchSignature('Mozilla/5.0 (compatible; GPTBot/1.1)', sigs), 'GPTBot');
  assert.equal(matchSignature('mozilla/5.0 claudebot/1.0', sigs), 'ClaudeBot');
});

test('an unknown agent is never attributed a name', () => {
  assert.equal(matchSignature('Mozilla/5.0 (Macintosh) Safari/605', ['GPTBot']), null);
  assert.equal(matchSignature('', ['GPTBot']), null);
});

test('plugin_type is the value the ingestion enum must accept', () => {
  assert.equal(PLUGIN_TYPE, 'shopify');
});

test('the signed string follows the documented contract exactly', async () => {
  // Same vector signed by hand: HMAC-SHA256 over "{ts}\nPOST\n{path}\n{body}".
  const ts = '1700000000';
  const path = '/api/v1/tracking/events';
  const body = '{"a":1}';
  const secret = 'secret';

  const mine = await sign(ts, 'POST', path, body, secret);

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = Array.from(new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${ts}\nPOST\n${path}\n${body}`),
  ))).map((b) => b.toString(16).padStart(2, '0')).join('');

  assert.equal(mine, expected);
  assert.notEqual(mine, await sign(ts, 'GET', path, body, secret));
  assert.notEqual(mine, await sign(ts, 'POST', path, body, 'other'));
});
