/**
 * AI Labs Audit — Shopify App Proxy collector.
 *
 * Shopify forwards `https://{shop}/apps/{subpath}/...` to this worker, keeping
 * the visitor's User-Agent intact. That is the only place in hosted Shopify
 * where a bot's User-Agent is available without JavaScript — measured, not
 * assumed. See ../README.md for what this can and cannot see.
 *
 * Routes (relative to the App Proxy subpath):
 *   /agents.md         variant H target — linked from <head>
 *   /llms.txt          alias of the same content
 *   /guide-agents      variant B target — linked from a visible <a>
 *   /reference-agents  control — linked from nowhere, measures background noise
 *
 * Secrets (wrangler secret put):
 *   SHOPIFY_APP_SECRET  Shopify app client secret, to verify proxy signatures
 *   STORE_MAP           JSON {shop domain: {client_id, api_key, api_secret}}
 * Vars (wrangler.toml):
 *   API_URL             AI Labs Audit API base, e.g. https://…/api/v1
 * Optional bindings:
 *   STORES              KV namespace, one JSON entry per shop domain
 */

import { BOT_SIGNATURES } from './defaults.js';
import { getBotSignatures } from './cache.js';
import { verifyProxySignature } from './shopify-proxy.js';
import { lookupStore } from './stores.js';
import { agentsMarkdown, controlMarkdown } from './content.js';
import { sendEvents, sign } from './tracker.js';

/** Which experimental variant a path belongs to. */
const ROUTES = {
  '/agents.md': { variant: 'H', body: agentsMarkdown },
  '/llms.txt': { variant: 'H', body: agentsMarkdown },
  '/guide-agents': { variant: 'B', body: agentsMarkdown },
  '/reference-agents': { variant: 'T', body: controlMarkdown },
};

/**
 * Strip the App Proxy prefix so routing is independent of the subpath the
 * merchant configured.
 *
 * @param {string} pathname
 * @returns {string} Path relative to the proxy root, leading slash kept.
 */
export function proxyRelativePath(pathname) {
  const match = pathname.match(/^\/apps\/[^/]+(\/.*)?$/);
  if (match) return match[1] || '/';
  return pathname;
}

/**
 * Match a User-Agent against the known signatures.
 *
 * Returns the signature that matched, never a guess. An unrecognised agent is
 * reported as-is and classified server-side as `unknown` — we never attribute a
 * name Shopify did not give us.
 *
 * @param {string} ua
 * @param {string[]} signatures
 * @returns {string|null}
 */
export function matchSignature(ua, signatures) {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  for (const sig of signatures) {
    if (lower.includes(sig.toLowerCase())) return sig;
  }
  return null;
}

/**
 * Build the ingestion event for one proxy request.
 *
 * `url` carries the variant so that H, B and the control stay distinguishable
 * in the data; without it the whole experiment collapses into one number.
 */
function buildEvent(request, relPath, variant) {
  return {
    type: 'bot_crawl',
    user_agent: (request.headers.get('user-agent') || '').substring(0, 500),
    url: `${relPath}?variant=${variant}`.substring(0, 2000),
    timestamp: new Date().toISOString(),
    status_code: 200,
    response_size: 0,
  };
}

function markdownResponse(text) {
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // Caching would hide exactly what we are trying to count.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const relPath = proxyRelativePath(url.pathname);
    const route = ROUTES[relPath];

    if (!route) {
      return new Response('Not found', { status: 404 });
    }

    // Shopify signs every proxied request. Unsigned traffic is not from a
    // storefront, and counting it would mean measuring our own noise.
    const signed = await verifyProxySignature(url, env.SHOPIFY_APP_SECRET);
    if (!signed) {
      return new Response('Invalid signature', { status: 403 });
    }

    const shopDomain = url.searchParams.get('shop') || '';
    const origin = `https://${shopDomain}`;
    const response = markdownResponse(route.body(shopDomain, origin));

    // From here on, nothing may prevent the merchant's page from being served.
    const store = await lookupStore(shopDomain, env);
    if (!store || request.method !== 'GET') {
      return response;
    }

    let signatures = BOT_SIGNATURES;
    try {
      signatures = await getBotSignatures(env, sign);
    } catch (e) {
      // The bundled list is a deliberate fallback: a refresh failure must
      // degrade detection, never drop the request.
    }

    const ua = request.headers.get('user-agent') || '';
    if (matchSignature(ua, signatures) || ua) {
      ctx.waitUntil(
        sendEvents([buildEvent(request, relPath, route.variant)], store, env)
          .then((resp) => {
            if (!resp.ok && resp.status !== 429) {
              console.error(`AilabsAudit: API returned HTTP ${resp.status}`);
            }
          })
          .catch((err) => console.error('AilabsAudit: send failed —', err.message)),
      );
    }

    return response;
  },
};
