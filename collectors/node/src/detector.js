'use strict';

const { URL } = require('url');

/**
 * Match user-agent against bot signatures (case-insensitive).
 *
 * @param {string} userAgent
 * @param {string[]} botSignatures
 * @returns {string|null} Matched pattern or null.
 */
function matchBot(userAgent, botSignatures) {
  if (!userAgent) return null;
  const uaLower = userAgent.toLowerCase();
  for (const pattern of botSignatures) {
    if (uaLower.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

/**
 * Match hostname against AI referrer domains (case-insensitive).
 *
 * @param {string} hostname
 * @param {string[]} aiReferrers
 * @returns {string|null} Matched domain or null.
 */
function matchReferrer(hostname, aiReferrers) {
  if (!hostname) return null;
  const hostLower = hostname.toLowerCase();
  for (const domain of aiReferrers) {
    const domainLower = domain.toLowerCase();
    if (hostLower === domainLower || hostLower.endsWith('.' + domainLower)) {
      return domain;
    }
  }
  return null;
}

/**
 * Create Express-compatible middleware for detection.
 *
 * @param {import('./index').AilabsTracker} tracker - Tracker instance with detection enabled.
 * @returns {Function} Express middleware (req, res, next).
 */
function createMiddleware(tracker) {
  return function ailabsauditMiddleware(req, res, next) {
    const ua = req.headers['user-agent'] || '';
    const url = req.originalUrl || req.url || '/';

    if (!ua) {
      next();
      return;
    }

    const botSignatures = tracker._cache ? tracker._cache.getBotSignatures() : tracker._defaults.BOT_SIGNATURES;
    const aiReferrers = tracker._cache ? tracker._cache.getAiReferrers() : tracker._defaults.AI_REFERRERS;

    // Check bot crawl.
    const matchedBot = matchBot(ua, botSignatures);
    if (matchedBot) {
      tracker._buffer.add({
        type: 'bot_crawl',
        user_agent: ua.substring(0, 500),
        url: url.substring(0, 2000),
        timestamp: new Date().toISOString(),
        status_code: 200,
        response_size: 0,
      });
      next();
      return;
    }

    // Check AI referrer.
    const referer = req.headers['referer'] || req.headers['referrer'] || '';
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const matchedDomain = matchReferrer(refUrl.hostname, aiReferrers);
        if (matchedDomain) {
          tracker._buffer.add({
            type: 'ai_referral',
            referrer_domain: matchedDomain,
            url: url.substring(0, 2000),
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e) {
        // Invalid referer URL, skip.
      }
    }

    next();
  };
}

module.exports = { matchBot, matchReferrer, createMiddleware };
