# AI Labs Audit Tracker — Cloudflare Worker Collector

Transparent page-view tracking that runs on the Cloudflare edge. Sits in front of your origin, signs payloads with HMAC-SHA256 via Web Crypto API, and sends events without blocking the response.

## Setup

1. Install wrangler: `npm install -g wrangler`
2. Set secrets:
   ```bash
   wrangler secret put TRACKER_ID
   wrangler secret put API_SECRET
   ```
3. Deploy: `wrangler deploy`

## Configuration (`wrangler.toml`)

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | Ingestion endpoint | `https://api.ailabsaudit.com/v1/collect` |
| `TRACKER_ID` | Tracker ID (secret) | — |
| `API_SECRET` | HMAC secret (secret) | — |

## How it works

- Intercepts `GET` requests (skips static assets by extension)
- Builds a `page_view` payload with URL, referrer, user-agent, anonymized IP
- Signs and sends the event via `ctx.waitUntil()` (fire-and-forget)
- Passes the request through to origin unmodified

## Tests

```bash
node tests/hmac.test.js
```

## Requirements

- Cloudflare Workers account
- `nodejs_compat` compatibility flag (set in wrangler.toml)
