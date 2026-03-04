'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { BOT_SIGNATURES, AI_REFERRERS } = require('./defaults');

const CACHE_TTL = 86400 * 1000; // 24 hours in ms.

/**
 * List cache — refreshes bot signatures and AI referrers from the API.
 * Falls back to hardcoded defaults when API is unavailable.
 */
class ListCache {
  /**
   * @param {Object} config
   * @param {string} config.apiUrl    - API base URL.
   * @param {string} config.apiKey    - API key.
   * @param {string} config.apiSecret - HMAC signing secret.
   * @param {Function} config.sign    - HMAC sign function.
   */
  constructor(config) {
    this._apiUrl = config.apiUrl.replace(/\/$/, '');
    this._apiKey = config.apiKey;
    this._apiSecret = config.apiSecret;
    this._sign = config.sign;

    this._botSignatures = BOT_SIGNATURES;
    this._aiReferrers = AI_REFERRERS;
    this._botEtag = '';
    this._referrerEtag = '';
    this._botExpiresAt = 0;
    this._referrerExpiresAt = 0;
    this._refreshTimer = null;
  }

  /** @returns {string[]} */
  getBotSignatures() {
    if (Date.now() > this._botExpiresAt) {
      this._refreshBotSignatures();
    }
    return this._botSignatures;
  }

  /** @returns {string[]} */
  getAiReferrers() {
    if (Date.now() > this._referrerExpiresAt) {
      this._refreshAiReferrers();
    }
    return this._aiReferrers;
  }

  /** Start periodic background refresh. */
  start() {
    this._refreshBotSignatures();
    this._refreshAiReferrers();
    this._refreshTimer = setInterval(() => {
      this._refreshBotSignatures();
      this._refreshAiReferrers();
    }, CACHE_TTL);
    this._refreshTimer.unref();
  }

  /** Stop background refresh. */
  stop() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  /** @private */
  _refreshBotSignatures() {
    const path = '/api/v1/bot-signatures';
    this._fetchList(path, this._botEtag, (data, etag) => {
      if (data && data.signatures && Array.isArray(data.signatures)) {
        const patterns = data.signatures
          .map((s) => s.pattern)
          .filter((p) => typeof p === 'string' && p.length > 0 && p.length < 256);
        if (patterns.length > 0) {
          this._botSignatures = patterns;
          this._botEtag = etag;
        }
      }
      this._botExpiresAt = Date.now() + CACHE_TTL;
    }, (notModified) => {
      this._botExpiresAt = Date.now() + CACHE_TTL;
    });
  }

  /** @private */
  _refreshAiReferrers() {
    const path = '/api/v1/ai-referrers';
    this._fetchList(path, this._referrerEtag, (data, etag) => {
      if (data && data.referrers && Array.isArray(data.referrers)) {
        const domains = data.referrers
          .map((r) => r.domain)
          .filter((d) => typeof d === 'string' && d.length > 0 && d.length < 256);
        if (domains.length > 0) {
          this._aiReferrers = domains;
          this._referrerEtag = etag;
        }
      }
      this._referrerExpiresAt = Date.now() + CACHE_TTL;
    }, (notModified) => {
      this._referrerExpiresAt = Date.now() + CACHE_TTL;
    });
  }

  /**
   * Fetch a list from the API with HMAC signing and ETag support.
   * @private
   */
  _fetchList(path, etag, onSuccess, onNotModified) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = this._sign(timestamp, 'GET', path, '', this._apiSecret);
    const url = new URL(this._apiUrl + path.replace('/api/v1', ''));
    const transport = url.protocol === 'https:' ? https : http;

    const headers = {
      'X-API-Key': this._apiKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'User-Agent': 'AilabsauditTracker/1.0.0 Node',
    };
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      timeout: 15000,
      rejectUnauthorized: true,
      headers,
    }, (res) => {
      if (res.statusCode === 304) {
        onNotModified(true);
        res.resume();
        return;
      }

      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            const newEtag = res.headers['etag'] || '';
            onSuccess(data, newEtag);
          } catch (e) {
            // Parse error, keep defaults.
          }
        }
      });
    });

    req.on('error', () => { /* Network error, keep defaults. */ });
    req.on('timeout', () => { req.destroy(); });
    req.end();
  }
}

module.exports = { ListCache };
