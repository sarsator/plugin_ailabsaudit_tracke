# ailabsaudit-tracker

> Open-source, privacy-first AI bot and referral tracking collectors — multi-platform.

## What is this?

A monorepo of lightweight collectors that detect AI bot crawls (GPTBot, ClaudeBot, PerplexityBot, DeepSeekBot, Google-Agent, and 100+ others) and AI referral traffic (ChatGPT, Perplexity, Claude, Gemini, Grok, etc.) on your website. Events are signed with HMAC-SHA256 and sent in batches to the ingestion API.

**Zero personal data collected** — no IP, no cookies, no fingerprinting.

## Collectors

| Collector | Language | Detection | Buffer | API Refresh | Install |
|-----------|----------|-----------|--------|-------------|---------|
| [Log Agent](collectors/log-agent/) | Go | 100 bots, 32 referrers | In-memory, 5 min flush | 24h TTL, ETag | **One command** |
| [WordPress](collectors/wordpress/) | PHP | 100 bots, 32 referrers | WP transients, WP-Cron | 24h TTL, ETag | Upload ZIP |
| [PHP Generic](collectors/php/) | PHP | 100 bots, 32 referrers | File JSON + LOCK_EX | 24h TTL, ETag | `composer require` |
| [Python](collectors/python/) | Python | 100 bots, 32 referrers | Thread-safe, 5 min flush | 24h TTL, ETag | `pip install` |
| [Cloudflare Worker](collectors/cloudflare-worker/) | JS | 100 bots, 32 referrers | Per-request (waitUntil) | CF Cache API | `wrangler deploy` |

## Quick start — Log Agent (any Linux server)

The fastest way to start tracking. One command, zero dependencies — downloads a static Go binary (~5 MB):

```bash
curl -sL https://raw.githubusercontent.com/sarsator/plugin_ailabsaudit_tracke/main/collectors/log-agent/install.sh | sudo bash -s -- \
  --api-key "YOUR_API_KEY" \
  --secret "YOUR_HMAC_SECRET" \
  --client-id "YOUR_CLIENT_ID" \
  --api-url "https://ailabsaudit.com/api/v1"
```

The installer:
1. Detects your CPU architecture (amd64/arm64)
2. Detects your web server (Nginx, Apache, LiteSpeed, Caddy)
3. Auto-finds your access log
4. Installs a systemd service that starts on boot
5. Starts tailing logs and sending events immediately

Get your credentials at **[ailabsaudit.com](https://ailabsaudit.com)** → Dashboard → API & Integrations.

> **Note**: Bot signatures and AI referrer lists refresh automatically from the API every 24 hours. The hardcoded lists are a fallback only.

## Other collectors

### WordPress
Upload the plugin ZIP in admin, enter credentials in Settings → AI Labs Audit, click Test Connection.

### Python (WSGI middleware)
```python
from ailabsaudit_tracker import AilabsTracker, WsgiMiddleware
tracker = AilabsTracker(api_key, api_secret, client_id, api_url, enable_detection=True)
app = WsgiMiddleware(app, tracker)
# On shutdown:
tracker.shutdown()
```

### PHP Generic
```php
$tracker = new AilabsTracker($apiKey, $apiSecret, $clientId, $apiUrl, enableDetection: true, bufferStorage: '/tmp/ailabs_buffer.json');
$tracker->detect();  // Call at the top of your front controller
```

### Cloudflare Worker
Configure secrets via `wrangler secret put`, deploy with `wrangler deploy`. Lists refresh automatically via CF Cache API.

## Configuration

All server-side collectors require:

| Setting | Description |
|---------|-------------|
| `API_KEY` | Your API key (`X-API-Key` header) |
| `API_SECRET` | HMAC-SHA256 signing secret |
| `CLIENT_ID` | Your client identifier |
| `API_URL` | API base URL (provided in your dashboard) |

Detection is **opt-in** (`enableDetection: false` by default) on Python and PHP Generic to preserve backward compatibility. The Log Agent and WordPress plugin have detection enabled by default.

## What is detected

**100 bot signatures**: GPTBot, ChatGPT-User, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended, Google-Agent, Googlebot, bingbot, CopilotBot, Bytespider, GrokBot, DeepSeekBot, Amazonbot, NovaAct, Firecrawl, Jina, YandexBot, Qwantbot, and 80+ more.

**32 AI referrer domains**: chatgpt.com, claude.ai, perplexity.ai, gemini.google.com, copilot.microsoft.com, grok.x.ai, deepseek.com, meta.ai, poe.com, qwant.com, duckduckgo.com, and 20+ more.

All files are detected including `/robots.txt`, `/llms.txt`, `/llms-full.txt` — the agent reads raw access logs, so every HTTP request from a matched bot is captured regardless of file type.

Full canonical list: [spec/default-lists.json](spec/default-lists.json)

## Protocol

- **Payload format**: [spec/payload-format.md](spec/payload-format.md)
- **HMAC signing**: [spec/hmac-signing.md](spec/hmac-signing.md)
- **API endpoints**: [spec/api-endpoints.md](spec/api-endpoints.md)
- **Test vectors**: [spec/test-vectors.json](spec/test-vectors.json)

## Privacy

No IP addresses, cookies, session identifiers, or PII are collected. Only bot user-agent strings, AI referrer domains, page URLs, timestamps, and HTTP status codes.

## Security

- HMAC-SHA256 signed payloads on all server-side collectors (4 required headers: X-API-Key, X-Timestamp, X-Nonce, X-Signature)
- TLS 1.2 minimum enforced (Go agent, Python SSL context)
- Exponential backoff on HTTP 429 (rate limiting)
- Config validation with strict bounds (rejects absurd values, enforces HTTPS)
- Log Agent: systemd hardened (NoNewPrivileges, ProtectSystem=strict, ProtectHome)
- Log Agent: diagnostic reporting to API on errors, update check (read-only, no auto-download)
- Config file permissions 640 (credentials never on GitHub)
- WordPress: TOCTOU-safe buffer lock, SSRF protection, CSRF nonce, rate limiting

## Testing

```bash
# Log Agent (Go)
cd collectors/log-agent && go test -v -race ./...

# Python
python3 collectors/python/tests/test_hmac.py -v
python3 collectors/python/tests/test_detection.py -v
python3 collectors/python/tests/test_buffer.py -v

# PHP
php collectors/php/tests/HmacTest.php
php collectors/php/tests/DetectionTest.php
php collectors/php/tests/BufferTest.php

# Cloudflare Worker
node collectors/cloudflare-worker/tests/hmac.test.js
node collectors/cloudflare-worker/tests/detection.test.js

# Cross-collector validation
node integration-tests/validate-vectors.js
node integration-tests/validate-lists.js
```

## Uninstall (Log Agent)

```bash
curl -sL https://raw.githubusercontent.com/sarsator/plugin_ailabsaudit_tracke/main/collectors/log-agent/uninstall.sh | sudo bash
```

## License

Server-side collectors: [MIT](LICENSE)
WordPress plugin: GPL-2.0-or-later
