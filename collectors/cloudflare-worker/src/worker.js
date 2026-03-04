/**
 * AI Labs Audit Tracker — Cloudflare Worker Collector
 *
 * Sits in front of your origin and tracks page views automatically.
 * Signs payloads with HMAC-SHA256 using the Web Crypto API.
 *
 * Secrets (set via `wrangler secret put`):
 *   TRACKER_ID  — Your tracker ID (e.g. TRK-00001)
 *   API_SECRET  — HMAC signing secret
 *
 * Env vars (wrangler.toml [vars]):
 *   API_URL     — Ingestion endpoint
 */

const encoder = new TextEncoder();

// -----------------------------------------------------------------
// Canonicalization & HMAC signing (Web Crypto)
// -----------------------------------------------------------------

/**
 * Recursively sort object keys alphabetically.
 * @param {*} data
 * @returns {*}
 */
function sortRecursive(data) {
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sortRecursive);
  const sorted = {};
  for (const key of Object.keys(data).sort()) {
    sorted[key] = sortRecursive(data[key]);
  }
  return sorted;
}

/**
 * Canonicalize payload to deterministic JSON (sorted keys, compact).
 * @param {Object} payload
 * @returns {string}
 */
function canonicalize(payload) {
  return JSON.stringify(sortRecursive(payload));
}

/**
 * Import a secret string as an HMAC CryptoKey.
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
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
 * Compute HMAC-SHA256 and return lowercase hex.
 * @param {string} canonicalJson
 * @param {string} secret
 * @returns {Promise<string>}
 */
async function sign(canonicalJson, secret) {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(canonicalJson));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build X-Signature header value.
 * @param {string} canonicalJson
 * @param {string} secret
 * @returns {Promise<string>}
 */
async function signatureHeader(canonicalJson, secret) {
  return 'sha256=' + await sign(canonicalJson, secret);
}

// -----------------------------------------------------------------
// Payload building
// -----------------------------------------------------------------

/**
 * Build a tracking payload from the incoming request.
 * @param {Request} request
 * @param {string} trackerId
 * @returns {Object}
 */
function buildPayload(request, trackerId) {
  const url = new URL(request.url);
  const payload = {
    event: 'page_view',
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    tracker_id: trackerId,
    url: url.origin + url.pathname + url.search,
  };

  const referrer = request.headers.get('referer');
  if (referrer) payload.referrer = referrer;

  const ua = request.headers.get('user-agent');
  if (ua) payload.user_agent = ua;

  const ip = request.headers.get('cf-connecting-ip');
  if (ip) {
    // Anonymize IPv4: zero last octet
    payload.ip = ip.replace(/\.\d+$/, '.0');
  }

  return payload;
}

// -----------------------------------------------------------------
// Send event to API (fire-and-forget via waitUntil)
// -----------------------------------------------------------------

/**
 * Send a signed event to the ingestion API.
 * @param {Object} payload
 * @param {string} apiUrl
 * @param {string} apiSecret
 * @param {string} trackerId
 * @returns {Promise<Response>}
 */
async function sendEvent(payload, apiUrl, apiSecret, trackerId) {
  const canonical = canonicalize(payload);
  const sig = await signatureHeader(canonical, apiSecret);

  return fetch(apiUrl, {
    method: 'POST',
    body: canonical,
    headers: {
      'Content-Type': 'application/json',
      'X-Tracker-Id': trackerId,
      'X-Signature': sig,
      'X-Timestamp': payload.timestamp,
      'User-Agent': 'AilabsAudit-CFWorker/1.0.0',
    },
  });
}

// -----------------------------------------------------------------
// Worker entry point
// -----------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    // Only track navigational GET requests (skip assets, API calls, etc.)
    const url = new URL(request.url);
    const ext = url.pathname.split('.').pop();
    const skipExtensions = ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'map'];

    const shouldTrack =
      request.method === 'GET' &&
      !skipExtensions.includes(ext) &&
      env.TRACKER_ID &&
      env.API_SECRET;

    if (shouldTrack) {
      const payload = buildPayload(request, env.TRACKER_ID);
      const apiUrl = env.API_URL || 'https://api.ailabsaudit.com/v1/collect';

      // Fire-and-forget: don't block the response to origin
      ctx.waitUntil(
        sendEvent(payload, apiUrl, env.API_SECRET, env.TRACKER_ID).catch(() => {}),
      );
    }

    // Pass through to origin
    return fetch(request);
  },
};

// Export signing functions for testing
export { canonicalize, sign, signatureHeader, sortRecursive };
