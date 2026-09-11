/**
 * Mapping a Shopify store to its AI Labs Audit credentials.
 *
 * Every store signs with its own key: the merchant's data must never be written
 * under another merchant's client_id, and a leaked key must compromise one store
 * and no more.
 *
 * Two sources, in order:
 *   1. a KV namespace bound as STORES, one JSON entry per shop domain;
 *   2. a STORE_MAP secret holding a JSON object, for small deployments.
 *
 * Credentials never reach the storefront: they live here, server-side. Nothing
 * in Liquid, nothing in a public URL.
 */

/**
 * @param {string} shopDomain e.g. "example.myshopify.com"
 * @param {Object} env
 * @returns {Promise<{client_id: string, api_key: string, api_secret: string}|null>}
 */
export async function lookupStore(shopDomain, env) {
  if (!shopDomain) return null;

  if (env.STORES && typeof env.STORES.get === 'function') {
    const raw = await env.STORES.get(shopDomain);
    if (raw) return normalise(JSON.parse(raw));
  }

  if (env.STORE_MAP) {
    try {
      const map = JSON.parse(env.STORE_MAP);
      if (map[shopDomain]) return normalise(map[shopDomain]);
    } catch (e) {
      console.error('AilabsAudit: STORE_MAP is not valid JSON.');
    }
  }

  return null;
}

/**
 * A partially configured store is worse than an unconfigured one: it would fail
 * at signing time, inside waitUntil, where nobody reads the error.
 */
function normalise(entry) {
  const { client_id, api_key, api_secret, variant } = entry || {};
  if (!client_id || !api_key || !api_secret) return null;
  return { client_id, api_key, api_secret, variant: variant || 'H' };
}
