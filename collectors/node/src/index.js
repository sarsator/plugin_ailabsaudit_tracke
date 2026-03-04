'use strict';

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// -----------------------------------------------------------------
// HMAC signing — format: "{timestamp}\n{method}\n{path}\n{body}"
// -----------------------------------------------------------------

/**
 * Build HMAC-SHA256 signature.
 *
 * @param {string} timestamp Unix epoch seconds.
 * @param {string} method    HTTP method (GET, POST).
 * @param {string} path      API path (e.g. /api/v1/tracking/events).
 * @param {string} body      JSON body (empty string for GET).
 * @param {string} secret    HMAC secret.
 * @returns {string} Lowercase hex signature (64 chars).
 */
function sign(timestamp, method, path, body, secret) {
  const stringToSign = `${timestamp}\n${method}\n${path}\n${body}`;
  return crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');
}

/**
 * Build the X-Signature header value (raw hex, no prefix).
 *
 * @param {string} timestamp
 * @param {string} method
 * @param {string} path
 * @param {string} body
 * @param {string} secret
 * @returns {string}
 */
function signatureHeader(timestamp, method, path, body, secret) {
  return sign(timestamp, method, path, body, secret);
}

// -----------------------------------------------------------------
// Tracker class
// -----------------------------------------------------------------

class AilabsTracker {
  /**
   * @param {Object} config
   * @param {string} config.apiKey     - API key for X-API-Key header.
   * @param {string} config.apiSecret  - HMAC signing secret.
   * @param {string} config.clientId   - Client identifier.
   * @param {string} [config.apiUrl]   - API base URL.
   * @param {number} [config.timeout]  - HTTP timeout in ms (default 5000).
   */
  constructor(config) {
    if (config.apiUrl && !config.apiUrl.startsWith('https://')) {
      throw new Error('AilabsTracker: apiUrl must use HTTPS');
    }
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.clientId = config.clientId;
    this.apiUrl = config.apiUrl || 'https://YOUR_API_DOMAIN/api/v1';
    this.timeout = config.timeout || 5000;
    this.version = '1.0.0';
  }

  /**
   * Send a batch of events to the API.
   *
   * @param {Object[]} events - Array of event objects.
   * @returns {Promise<{success: boolean, statusCode: number, body: string}>}
   */
  async sendEvents(events) {
    const payload = JSON.stringify({
      client_id: this.clientId,
      plugin_type: 'node',
      plugin_version: this.version,
      batch_id: crypto.randomUUID(),
      events,
    });

    return this._send('POST', '/api/v1/tracking/events', '/tracking/events', payload);
  }

  /**
   * Verify API connection.
   *
   * @returns {Promise<{success: boolean, statusCode: number, body: string}>}
   */
  async verifyConnection() {
    const payload = JSON.stringify({
      tracking_api_key: this.apiKey,
      client_id: this.clientId,
      plugin_type: 'node',
      plugin_version: this.version,
    });

    return this._send('POST', '/api/v1/tracking/verify', '/tracking/verify', payload);
  }

  /**
   * Send a signed request to the API.
   * @private
   * @param {string} method   HTTP method.
   * @param {string} hmacPath Path used for HMAC (includes /api/v1 prefix).
   * @param {string} urlPath  Path appended to API URL.
   * @param {string} body     JSON body.
   * @returns {Promise<{success: boolean, statusCode: number, body: string}>}
   */
  _send(method, hmacPath, urlPath, body) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();
    const signature = sign(timestamp, method, hmacPath, body, this.apiSecret);

    const url = new URL(this.apiUrl.replace(/\/$/, '') + urlPath);
    const transport = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      timeout: this.timeout,
      rejectUnauthorized: true,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature,
        'User-Agent': `AilabsauditTracker/${this.version} Node/${process.version}`,
        'Content-Length': Buffer.byteLength(body, 'utf8'),
      },
    };

    return new Promise((resolve) => {
      const req = transport.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          resolve({
            success: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body: responseBody,
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

      req.write(body);
      req.end();
    });
  }
}

module.exports = { AilabsTracker, sign, signatureHeader };
