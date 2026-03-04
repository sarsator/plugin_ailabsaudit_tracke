# AI Labs Audit Tracker — Node.js Collector

Zero-dependency Node.js library for detecting AI bot crawls and AI referral traffic. Sends HMAC-SHA256 signed event batches to the ingestion API.

## Installation

```bash
npm install @ailabsaudit/tracker-node
```

Or copy `src/index.js` directly into your project.

## Usage

```js
const { AilabsTracker } = require('@ailabsaudit/tracker-node');

const tracker = new AilabsTracker({
  apiKey: 'your-api-key',
  apiSecret: 'your-hmac-secret',
  clientId: 'your-client-id',
  apiUrl: 'https://YOUR_API_DOMAIN/api/v1',  // must be HTTPS
});

// Send a batch of events
const result = await tracker.sendEvents([
  {
    type: 'bot_crawl',
    user_agent: req.headers['user-agent'],
    url: req.url,
    timestamp: new Date().toISOString(),
    status_code: 200,
    response_size: 0,
  },
]);
// result = { success: true, statusCode: 202, body: '...' }

// Verify API connection
const verify = await tracker.verifyConnection();
```

## HMAC Signing

```js
const { sign, signatureHeader } = require('@ailabsaudit/tracker-node');

const timestamp = String(Math.floor(Date.now() / 1000));
const signature = sign(timestamp, 'POST', '/api/v1/tracking/events', body, secret);
// => "a1b2c3..." (64-char hex, no prefix)
```

Signing format: `"{timestamp}\n{method}\n{path}\n{body}"` — no canonicalization, no key sorting.

## Tests

```bash
node tests/hmac.test.js
```

## Requirements

- Node.js 14+
- No external dependencies
- API URL must use HTTPS
