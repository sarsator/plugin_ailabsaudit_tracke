/**
 * Verifying that a request really came from Shopify's App Proxy.
 *
 * Shopify appends a `signature` query parameter: the HMAC-SHA256, in hex, of
 * every other query parameter sorted by name and concatenated as `key=value`
 * with no separator, keyed by the app's client secret.
 *
 * Without this check the endpoint would accept forged traffic from anyone who
 * guessed the URL, and the pilot would measure noise it created itself.
 */

const encoder = new TextEncoder();

/**
 * Constant-time comparison. A plain `===` on a hex digest leaks, through timing,
 * how many leading characters were correct.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Build the string Shopify signed: params sorted by name, `key=value`
 * concatenated, `signature` itself excluded. Repeated parameters are joined
 * with a comma, as Shopify does.
 *
 * @param {URLSearchParams} params
 * @returns {string}
 */
export function signedPayload(params) {
  const grouped = new Map();
  for (const [key, value] of params) {
    if (key === 'signature') continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return [...grouped.keys()]
    .sort()
    .map((key) => `${key}=${grouped.get(key).join(',')}`)
    .join('');
}

/**
 * @param {URL} url
 * @param {string} appSecret Shopify app client secret.
 * @returns {Promise<boolean>}
 */
export async function verifyProxySignature(url, appSecret) {
  const provided = url.searchParams.get('signature');
  if (!provided || !appSecret) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload(url.searchParams)),
  );
  const expected = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return safeEqual(expected, provided.toLowerCase());
}
