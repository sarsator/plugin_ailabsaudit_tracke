# AI Labs Audit Tracker — Node.js Collector

Zero-dependency Node.js library for sending HMAC-SHA256 signed events to the AI Labs Audit API.

## Installation

```bash
npm install @ailabsaudit/tracker-node
```

## Usage

```js
const { AilabsTracker } = require('@ailabsaudit/tracker-node');

const tracker = new AilabsTracker({
  trackerId: 'TRK-00001',
  apiSecret: 'your_api_secret',
});

// Track a custom event
await tracker.track('cta_click', 'https://example.com/pricing', {
  meta: { button_id: 'hero-signup' },
});

// Express middleware — auto-track page views
app.use((req, res, next) => {
  tracker.trackPageView(req).catch(() => {});
  next();
});
```

## Standalone HMAC signing

```js
const { canonicalize, sign, signatureHeader } = require('@ailabsaudit/tracker-node');

const canonical = canonicalize(payload);
const sig = sign(canonical, secret);         // hex string
const header = signatureHeader(canonical, secret); // "sha256=..."
```

## Tests

```bash
node tests/hmac.test.js
```

## Requirements

- Node.js 14+
- No external dependencies
