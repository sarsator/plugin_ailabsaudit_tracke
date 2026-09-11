/**
 * List cache using Cloudflare Cache API.
 *
 * Persists bot signatures and AI referrer lists between requests
 * without needing KV bindings. Falls back to defaults.js.
 */

import { BOT_SIGNATURES, AI_REFERRERS } from './defaults.js';

const CACHE_TTL = 86400; // 24 hours in seconds.

/**
 * Get bot signatures — tries CF Cache API first, then fetches from API.
 *
 * @param {Object} env Worker environment.
 * @param {Function} signFn HMAC sign function.
 * @returns {Promise<string[]>}
 */
export async function getBotSignatures(env, signFn) {
  const cacheKey = new URL('https://ailabsaudit-cache/bot-signatures');
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (e) {
      // Corrupted cache, refresh.
    }
  }

  // Fetch from API.
  const fresh = await fetchBotSignatures(env, signFn);
  if (fresh) {
    const resp = new Response(JSON.stringify(fresh), {
      headers: { 'Cache-Control': `max-age=${CACHE_TTL}` },
    });
    await cache.put(cacheKey, resp);
    return fresh;
  }

  return BOT_SIGNATURES;
}

/**
 * Get AI referrers — tries CF Cache API first, then fetches from API.
 *
 * @param {Object} env Worker environment.
 * @param {Function} signFn HMAC sign function.
 * @returns {Promise<string[]>}
 */
export async function getAiReferrers(env, signFn) {
  const cacheKey = new URL('https://ailabsaudit-cache/ai-referrers');
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (e) {
      // Corrupted cache, refresh.
    }
  }

  const fresh = await fetchAiReferrers(env, signFn);
  if (fresh) {
    const resp = new Response(JSON.stringify(fresh), {
      headers: { 'Cache-Control': `max-age=${CACHE_TTL}` },
    });
    await cache.put(cacheKey, resp);
    return fresh;
  }

  return AI_REFERRERS;
}

/**
 * Fetch bot signatures from the API.
 * @private
 */
async function fetchBotSignatures(env, signFn) {
  if (!env.API_URL || !env.API_KEY || !env.API_SECRET) return null;

  const apiUrl = env.API_URL.replace(/\/$/, '');
  const path = '/api/v1/bot-signatures';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signFn(timestamp, 'GET', path, '', env.API_SECRET);

  try {
    const resp = await fetch(apiUrl + '/bot-signatures', {
      headers: {
        'X-API-Key': env.API_KEY,
        'X-Timestamp': timestamp,
        'X-Nonce': crypto.randomUUID(),
        'X-Signature': signature,
        'User-Agent': 'AilabsauditTracker/1.0.0 Cloudflare-Worker',
      },
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data && Array.isArray(data.signatures)) {
        const patterns = data.signatures
          .map((s) => s.pattern)
          .filter((p) => typeof p === 'string' && p.length > 0 && p.length < 256);
        if (patterns.length > 0) return patterns;
      }
    }
  } catch (e) {
    // Network error, fall back to defaults.
  }

  return null;
}

/**
 * Fetch AI referrers from the API.
 * @private
 */
async function fetchAiReferrers(env, signFn) {
  if (!env.API_URL || !env.API_KEY || !env.API_SECRET) return null;

  const apiUrl = env.API_URL.replace(/\/$/, '');
  const path = '/api/v1/ai-referrers';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signFn(timestamp, 'GET', path, '', env.API_SECRET);

  try {
    const resp = await fetch(apiUrl + '/ai-referrers', {
      headers: {
        'X-API-Key': env.API_KEY,
        'X-Timestamp': timestamp,
        'X-Nonce': crypto.randomUUID(),
        'X-Signature': signature,
        'User-Agent': 'AilabsauditTracker/1.0.0 Cloudflare-Worker',
      },
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data && Array.isArray(data.referrers)) {
        const domains = data.referrers
          .map((r) => r.domain)
          .filter((d) => typeof d === 'string' && d.length > 0 && d.length < 256);
        if (domains.length > 0) return domains;
      }
    }
  } catch (e) {
    // Network error, fall back to defaults.
  }

  return null;
}
