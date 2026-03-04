# AI Labs Audit Tracker — Cloudflare Worker Collector

Transparent AI bot and referral detection that runs on the Cloudflare edge. Sits in front of your origin, signs payloads with HMAC-SHA256 via Web Crypto API, and sends events without blocking the response.

## Setup

1. Install wrangler: `npm install -g wrangler`
2. Edit `wrangler.toml` and set `API_URL` to your API base URL.
3. Set secrets:
   ```bash
   wrangler secret put API_KEY
   wrangler secret put API_SECRET
   wrangler secret put CLIENT_ID
   ```
4. Deploy: `wrangler deploy`

## Configuration

### `wrangler.toml` vars

| Variable | Description | Required |
|----------|-------------|----------|
| `API_URL` | API base URL | Yes |

### Secrets (via `wrangler secret put`)

| Secret | Description |
|--------|-------------|
| `API_KEY` | API key for `X-API-Key` header |
| `API_SECRET` | HMAC signing secret |
| `CLIENT_ID` | Your client identifier |

## How it works

- Intercepts `GET` requests (skips static assets by extension)
- Detects AI bot user-agents (50+ signatures) and AI referrers (20+ domains)
- Signs and sends the event via `ctx.waitUntil()` (fire-and-forget)
- Passes the request through to origin unmodified
- Zero personal data collected (no IP, no cookies)

## Tests

```bash
node tests/hmac.test.js
```

## Requirements

- Cloudflare Workers account
- `nodejs_compat` compatibility flag (set in wrangler.toml)
