/**
 * AI Labs Audit Tracker — Cloudflare Worker Collector
 *
 * Sits in front of your origin and tracks AI bot crawls and AI referrals.
 * Signs payloads with HMAC-SHA256 using the Web Crypto API.
 *
 * HMAC format: "{timestamp}\n{method}\n{path}\n{body}"
 *
 * Secrets (set via `wrangler secret put`):
 *   API_KEY     — Your API key
 *   API_SECRET  — HMAC signing secret
 *   CLIENT_ID   — Your client identifier
 *
 * Env vars (wrangler.toml [vars]):
 *   API_URL     — API base URL (must be set in wrangler.toml or env)
 */

const encoder = new TextEncoder();

// -----------------------------------------------------------------
// HMAC signing (Web Crypto)
// -----------------------------------------------------------------

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
 * Compute HMAC-SHA256 signature.
 *
 * Format: "{timestamp}\n{method}\n{path}\n{body}"
 *
 * @param {string} timestamp Unix epoch seconds.
 * @param {string} method    HTTP method.
 * @param {string} path      API path.
 * @param {string} body      JSON body (empty string for GET).
 * @param {string} secret    HMAC secret.
 * @returns {Promise<string>} Lowercase hex signature.
 */
async function sign(timestamp, method, path, body, secret) {
  const stringToSign = `${timestamp}\n${method}\n${path}\n${body}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build X-Signature header value (raw hex, no prefix).
 * @param {string} timestamp
 * @param {string} method
 * @param {string} path
 * @param {string} body
 * @param {string} secret
 * @returns {Promise<string>}
 */
async function signatureHeader(timestamp, method, path, body, secret) {
  return sign(timestamp, method, path, body, secret);
}

// -----------------------------------------------------------------
// Event detection
// -----------------------------------------------------------------

const DEFAULT_BOT_SIGNATURES = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'Operator',
  'ClaudeBot', 'Claude-Web', 'Claude-SearchBot', 'anthropic-ai',
  'Google-Extended', 'GoogleOther', 'PerplexityBot',
  'meta-externalagent', 'FacebookBot', 'facebookexternalhit',
  'bingbot', 'CopilotBot', 'Applebot', 'Applebot-Extended',
  'Bytespider', 'ByteDance', 'Amazonbot', 'CCBot', 'Diffbot',
  'cohere-ai', 'YouBot', 'DeepSeekBot', 'Mistral',
];

const DEFAULT_AI_REFERRERS = [
  'chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai',
  'gemini.google.com', 'copilot.microsoft.com', 'poe.com', 'you.com',
  'phind.com', 'deepseek.com', 'chat.deepseek.com', 'meta.ai',
  'chat.mistral.ai', 'kagi.com', 'brave.com', 'character.ai',
];

/**
 * Detect bot crawl or AI referral from the request.
 * @param {Request} request
 * @returns {{type: string, data: Object}|null}
 */
function detectEvent(request) {
  const ua = request.headers.get('user-agent') || '';
  const url = new URL(request.url);
  const pageUrl = url.pathname + url.search;

  // Check for AI bot
  if (ua) {
    const uaLower = ua.toLowerCase();
    for (const sig of DEFAULT_BOT_SIGNATURES) {
      if (uaLower.includes(sig.toLowerCase())) {
        return {
          type: 'bot_crawl',
          user_agent: ua.substring(0, 500),
          url: pageUrl.substring(0, 2000),
          timestamp: new Date().toISOString(),
          status_code: 200,
          response_size: 0,
        };
      }
    }
  }

  // Check for AI referrer
  const referer = request.headers.get('referer') || '';
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const host = refUrl.hostname.toLowerCase();
      for (const domain of DEFAULT_AI_REFERRERS) {
        if (host === domain || host.endsWith('.' + domain)) {
          return {
            type: 'ai_referral',
            referrer_domain: domain,
            url: pageUrl.substring(0, 2000),
            timestamp: new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      // Invalid referer URL, skip
    }
  }

  return null;
}

// -----------------------------------------------------------------
// Send events to API (fire-and-forget via waitUntil)
// -----------------------------------------------------------------

/**
 * Send a batch of events to the ingestion API.
 * @param {Object[]} events
 * @param {Object} env
 * @returns {Promise<Response>}
 */
async function sendEvents(events, env) {
  if (!env.API_URL) {
    throw new Error('AilabsAudit: API_URL environment variable is required.');
  }
  const apiUrl = env.API_URL.replace(/\/$/, '');

  const body = JSON.stringify({
    client_id: env.CLIENT_ID,
    plugin_type: 'cloudflare',
    plugin_version: '1.0.0',
    batch_id: crypto.randomUUID(),
    events,
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const hmacPath = '/api/v1/tracking/events';
  const signature = await sign(timestamp, 'POST', hmacPath, body, env.API_SECRET);

  return fetch(apiUrl + '/tracking/events', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': env.API_KEY,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'User-Agent': 'AilabsauditTracker/1.0.0 Cloudflare-Worker',
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
      env.API_KEY &&
      env.API_SECRET &&
      env.CLIENT_ID;

    if (shouldTrack) {
      const event = detectEvent(request);
      if (event) {
        ctx.waitUntil(
          sendEvents([event], env).catch((err) => {
            console.error('AilabsAudit: send failed —', err.message);
          }),
        );
      }
    }

    // Pass through to origin
    return fetch(request);
  },
};

// Export signing functions for testing
export { sign, signatureHeader };
