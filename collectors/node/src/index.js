'use strict';

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// -----------------------------------------------------------------
// Canonicalization & HMAC signing
// -----------------------------------------------------------------

/**
 * Recursively sort object keys alphabetically.
 * Arrays are preserved as-is (not sorted).
 *
 * @param {*} data
 * @returns {*}
 */
function sortRecursive(data) {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sortRecursive);
  }
  const sorted = {};
  for (const key of Object.keys(data).sort()) {
    sorted[key] = sortRecursive(data[key]);
  }
  return sorted;
}

/**
 * Canonicalize a payload object into a deterministic JSON string.
 * Keys sorted recursively, compact (no whitespace).
 *
 * @param {Object} payload
 * @returns {string}
 */
function canonicalize(payload) {
  return JSON.stringify(sortRecursive(payload));
}

/**
 * Compute HMAC-SHA256 signature.
 *
 * @param {string} canonicalJson
 * @param {string} secret
 * @returns {string} Lowercase hex signature.
 */
function sign(canonicalJson, secret) {
  return crypto.createHmac('sha256', secret).update(canonicalJson, 'utf8').digest('hex');
}

/**
 * Build the X-Signature header value.
 *
 * @param {string} canonicalJson
 * @param {string} secret
 * @returns {string} e.g. "sha256=abcdef..."
 */
function signatureHeader(canonicalJson, secret) {
  return 'sha256=' + sign(canonicalJson, secret);
}

// -----------------------------------------------------------------
// Tracker class
// -----------------------------------------------------------------

class AilabsTracker {
  /**
   * @param {Object} config
   * @param {string} config.trackerId  - Tracker ID (e.g. "TRK-00001").
   * @param {string} config.apiSecret  - HMAC signing secret.
   * @param {string} [config.apiUrl]   - API endpoint URL.
   * @param {number} [config.timeout]  - HTTP timeout in ms (default 5000).
   * @param {boolean} [config.anonymizeIp] - Anonymize IP (default true).
   */
  constructor(config) {
    this.trackerId = config.trackerId;
    this.apiSecret = config.apiSecret;
    this.apiUrl = config.apiUrl || 'https://api.ailabsaudit.com/v1/collect';
    this.timeout = config.timeout || 5000;
    this.anonymizeIp = config.anonymizeIp !== false;
  }

  /**
   * Track an event.
   *
   * @param {string} event - Event type (e.g. "page_view", "cta_click").
   * @param {string} url   - Page URL.
   * @param {Object} [options]
   * @param {string} [options.referrer]
   * @param {string} [options.userAgent]
   * @param {string} [options.ip]
   * @param {Object} [options.meta]
   * @returns {Promise<{success: boolean, statusCode: number, body: string}>}
   */
  async track(event, url, options = {}) {
    const payload = {
      event,
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      tracker_id: this.trackerId,
      url,
    };

    if (options.referrer) payload.referrer = options.referrer;
    if (options.userAgent) payload.user_agent = options.userAgent;
    if (options.ip) {
      payload.ip = this.anonymizeIp ? this._anonymizeIp(options.ip) : options.ip;
    }
    if (options.meta && Object.keys(options.meta).length > 0) {
      payload.meta = options.meta;
    }

    return this._send(payload);
  }

  /**
   * Track a page view from an Express-like request object.
   *
   * @param {Object} req - Express request object.
   * @param {Object} [meta] - Optional metadata.
   * @returns {Promise<{success: boolean, statusCode: number, body: string}>}
   */
  async trackPageView(req, meta = {}) {
    const protocol = req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get ? req.get('host') : req.headers?.host || 'localhost';
    const url = protocol + '://' + host + req.originalUrl;

    return this.track('page_view', url, {
      referrer: req.get ? req.get('referer') : req.headers?.referer,
      userAgent: req.get ? req.get('user-agent') : req.headers?.['user-agent'],
      ip: req.ip || req.connection?.remoteAddress,
      meta,
    });
  }

  /**
   * Send a signed payload to the API.
   * @private
   */
  _send(payload) {
    const canonical = canonicalize(payload);
    const sig = signatureHeader(canonical, this.apiSecret);
    const timestamp = payload.timestamp;

    const parsed = new URL(this.apiUrl);
    const transport = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Tracker-Id': this.trackerId,
        'X-Signature': sig,
        'X-Timestamp': timestamp,
        'User-Agent': 'AilabsAudit-Node/1.0.0',
        'Content-Length': Buffer.byteLength(canonical, 'utf8'),
      },
    };

    return new Promise((resolve) => {
      const req = transport.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          resolve({
            success: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body,
          });
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, statusCode: 0, body: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, statusCode: 0, body: 'timeout' });
      });

      req.write(canonical);
      req.end();
    });
  }

  /**
   * Anonymize IPv4 by zeroing last octet.
   * @private
   */
  _anonymizeIp(ip) {
    // IPv4
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      return ip.replace(/\.\d+$/, '.0');
    }
    return ip;
  }
}

module.exports = { AilabsTracker, canonicalize, sign, signatureHeader };
