/**
 * The proxy signature is the only thing standing between this endpoint and
 * anyone who guesses the URL. These tests mutate a genuine Shopify signature
 * and require every mutation to be rejected — a test that only checks the happy
 * path would pass against a function that returns true unconditionally.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyProxySignature, signedPayload, safeEqual } from '../src/shopify-proxy.js';

const SECRET = 'shpss_test_secret';

/** Sign params the way Shopify does, so fixtures are real, not hand-copied. */
async function shopifySign(params, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(signedPayload(params)),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signedUrl(extra = {}, secret = SECRET) {
  const u = new URL('https://worker.example/apps/ailabs/agents.md');
  u.searchParams.set('shop', 'example.myshopify.com');
  u.searchParams.set('path_prefix', '/apps/ailabs');
  u.searchParams.set('timestamp', '1789024593');
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  u.searchParams.set('signature', await shopifySign(u.searchParams, secret));
  return u;
}

test('a genuine Shopify signature is accepted', async () => {
  assert.equal(await verifyProxySignature(await signedUrl(), SECRET), true);
});

test('a request with no signature is rejected', async () => {
  const u = await signedUrl();
  u.searchParams.delete('signature');
  assert.equal(await verifyProxySignature(u, SECRET), false);
});

test('a signature from a different secret is rejected', async () => {
  const u = await signedUrl({}, 'wrong_secret');
  assert.equal(await verifyProxySignature(u, SECRET), false);
});

test('tampering with any signed parameter invalidates the signature', async () => {
  for (const param of ['shop', 'path_prefix', 'timestamp']) {
    const u = await signedUrl();
    u.searchParams.set(param, 'tampered');
    assert.equal(
      await verifyProxySignature(u, SECRET), false,
      `altering ${param} did not invalidate the signature`,
    );
  }
});

test('adding a parameter after signing invalidates the signature', async () => {
  const u = await signedUrl();
  u.searchParams.set('injected', '1');
  assert.equal(await verifyProxySignature(u, SECRET), false);
});

test('flipping one hex character of the signature is rejected', async () => {
  const u = await signedUrl();
  const sig = u.searchParams.get('signature');
  const flipped = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
  u.searchParams.set('signature', flipped);
  assert.equal(await verifyProxySignature(u, SECRET), false);
});

test('signedPayload sorts by name, excludes signature, joins repeats with a comma', () => {
  const p = new URLSearchParams('b=2&a=1&signature=zz&a=3');
  assert.equal(signedPayload(p), 'a=1,3b=2');
});

test('safeEqual rejects different lengths and differing content', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', null), false);
});
