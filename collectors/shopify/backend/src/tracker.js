/**
 * Talking to the AI Labs Audit ingestion API.
 *
 * Same contract as every other collector:
 *   POST {API_URL}/tracking/events
 *   HMAC-SHA256 over "{timestamp}\n{method}\n{path}\n{body}"
 *   headers X-API-Key / X-Timestamp / X-Nonce / X-Signature
 *
 * The signing path is always '/api/v1/tracking/events' regardless of API_URL,
 * because that is what the server signs against.
 */

const encoder = new TextEncoder();

export const PLUGIN_TYPE = 'shopify';
export const PLUGIN_VERSION = '0.1.0';

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Compute the HMAC-SHA256 signature required by the ingestion API.
 *
 * @param {string} timestamp Unix epoch seconds.
 * @param {string} method    HTTP method.
 * @param {string} path      Signing path.
 * @param {string} body      JSON body, empty string for GET.
 * @param {string} secret    Per-store HMAC secret.
 * @returns {Promise<string>} Lowercase hex digest.
 */
export async function sign(timestamp, method, path, body, secret) {
  const stringToSign = `${timestamp}\n${method}\n${path}\n${body}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Send one batch of events on behalf of a single store.
 *
 * Credentials are per store, never global: two merchants must never be able to
 * write into each other's data.
 *
 * @param {Object[]} events
 * @param {{client_id: string, api_key: string, api_secret: string}} store
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function sendEvents(events, store, env) {
  if (!env.API_URL) {
    throw new Error('AilabsAudit: API_URL is required.');
  }
  const apiUrl = env.API_URL.replace(/\/$/, '');

  const body = JSON.stringify({
    client_id: store.client_id,
    plugin_type: PLUGIN_TYPE,
    plugin_version: PLUGIN_VERSION,
    batch_id: crypto.randomUUID(),
    events,
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const hmacPath = '/api/v1/tracking/events';
  const signature = await sign(timestamp, 'POST', hmacPath, body, store.api_secret);

  return fetch(apiUrl + '/tracking/events', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': store.api_key,
      'X-Timestamp': timestamp,
      'X-Nonce': crypto.randomUUID(),
      'X-Signature': signature,
      'User-Agent': `AilabsauditTracker/${PLUGIN_VERSION} Shopify-AppProxy`,
    },
  });
}
