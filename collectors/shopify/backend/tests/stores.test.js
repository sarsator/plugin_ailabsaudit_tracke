/**
 * Per-store credentials. A half-configured store must not be treated as usable:
 * it would fail later, inside waitUntil, where the error is never read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupStore } from '../src/stores.js';

const COMPLETE = { client_id: 'CLT-1', api_key: 'k', api_secret: 's' };

test('a store is resolved from STORE_MAP', async () => {
  const env = { STORE_MAP: JSON.stringify({ 'a.myshopify.com': COMPLETE }) };
  const s = await lookupStore('a.myshopify.com', env);
  assert.equal(s.client_id, 'CLT-1');
  assert.equal(s.variant, 'H');
});

test('KV takes precedence over STORE_MAP', async () => {
  const env = {
    STORES: { get: async () => JSON.stringify({ ...COMPLETE, client_id: 'CLT-KV' }) },
    STORE_MAP: JSON.stringify({ 'a.myshopify.com': COMPLETE }),
  };
  assert.equal((await lookupStore('a.myshopify.com', env)).client_id, 'CLT-KV');
});

test('an unknown shop resolves to null', async () => {
  const env = { STORE_MAP: JSON.stringify({ 'a.myshopify.com': COMPLETE }) };
  assert.equal(await lookupStore('b.myshopify.com', env), null);
  assert.equal(await lookupStore('', env), null);
});

test('an incomplete store is rejected rather than half-used', async () => {
  for (const missing of ['client_id', 'api_key', 'api_secret']) {
    const entry = { ...COMPLETE };
    delete entry[missing];
    const env = { STORE_MAP: JSON.stringify({ 'a.myshopify.com': entry }) };
    assert.equal(
      await lookupStore('a.myshopify.com', env), null,
      `a store missing ${missing} was accepted`,
    );
  }
});

test('malformed STORE_MAP does not throw', async () => {
  assert.equal(await lookupStore('a.myshopify.com', { STORE_MAP: 'not json' }), null);
});
