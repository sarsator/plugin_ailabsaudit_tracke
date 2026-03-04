# ailabsaudit-tracker

> Open-source, privacy-first AI bot and referral tracking collectors — multi-platform.

## What is this?

A monorepo of lightweight collectors that detect AI bot crawls (GPTBot, ClaudeBot, PerplexityBot, and 50+ others) and AI referral traffic (ChatGPT, Perplexity, Claude, Gemini, etc.) on your website. Events are signed with HMAC-SHA256 and sent in batches to the ingestion API.

## Collectors

| Collector | Language | Description |
|-----------|----------|-------------|
| [WordPress](collectors/wordpress/) | PHP | Full plugin with admin UI, WP-Cron, transient buffer |
| [PHP Generic](collectors/php/) | PHP | Standalone tracker, zero dependencies |
| [Node.js](collectors/node/) | JS | CommonJS module, no external deps |
| [Python](collectors/python/) | Python | Standard library only |
| [Cloudflare Worker](collectors/cloudflare-worker/) | JS | Edge-based detection via Web Crypto API |
| [Pixel Tag](collectors/pixel/) | JS | Client-side tracker (<2 KB) |

## Quick start

1. Choose the collector matching your stack.
2. Configure with your **API Key**, **HMAC Secret**, **Client ID**, and **API URL** (provided in your dashboard).
3. Deploy. Events are detected and sent automatically.

See each collector's README for specific setup instructions.

## Configuration

All server-side collectors require:

| Setting | Description |
|---------|-------------|
| `API_KEY` | Your API key (`X-API-Key` header) |
| `API_SECRET` | HMAC-SHA256 signing secret |
| `CLIENT_ID` | Your client identifier |
| `API_URL` | API base URL (provided in your dashboard) |

## Protocol

- **Payload format**: [spec/payload-format.md](spec/payload-format.md)
- **HMAC signing**: [spec/hmac-signing.md](spec/hmac-signing.md)
- **API endpoints**: [spec/api-endpoints.md](spec/api-endpoints.md)
- **Test vectors**: [spec/test-vectors.json](spec/test-vectors.json)

## Privacy

No IP addresses, cookies, session identifiers, or PII are collected. Only bot user-agent strings, AI referrer domains, page URLs, timestamps, and HTTP status codes.

## Testing

```bash
# Full integration test suite
bash integration-tests/run-all.sh

# Individual collectors
node collectors/node/tests/hmac.test.js
python3 collectors/python/tests/test_hmac.py -v
php collectors/php/tests/HmacTest.php
node collectors/cloudflare-worker/tests/hmac.test.js
php collectors/wordpress/tests/test-hmac.php
```

## License

Server-side collectors: [MIT](LICENSE)
WordPress plugin: GPL-2.0-or-later
