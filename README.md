# ailabsaudit-tracker

> Universal tracking collectors for [AI Labs Audit](https://ailabsaudit.com) — open-source, privacy-first, multi-platform.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What is this?

A monorepo of lightweight collectors that capture page views, events, and Web Vitals from your website or app and forward them to the AI Labs Audit ingestion API. Each collector signs its payloads with HMAC-SHA256 to guarantee authenticity.

## Collectors

| Collector | Language | Status |
|-----------|----------|--------|
| [WordPress](collectors/wordpress/) | PHP | ✅ Ready |
| [PHP Generic](collectors/php/) | PHP | ✅ Ready |
| [Node.js](collectors/node/) | JS | ✅ Ready |
| [Python](collectors/python/) | Python | ✅ Ready |
| [Cloudflare Worker](collectors/cloudflare-worker/) | JS | ✅ Ready |
| [Pixel Tag](collectors/pixel/) | JS | ✅ Ready |

## Quick start — WordPress

1. Download the latest release ZIP or clone this repo.
2. Copy `collectors/wordpress/` into `wp-content/plugins/ailabsaudit-tracker/`.
3. Activate the plugin in **Plugins → Installed Plugins**.
4. Go to **Settings → AI Labs Audit Tracker** and enter your **Tracker ID** and **API Secret**.
5. Done — page views are tracked automatically.

## Payload format

All collectors send JSON payloads to the ingestion API. See [spec/payload-format.md](spec/payload-format.md) for the full schema.

## Security

Every request is signed with HMAC-SHA256. See [spec/hmac-signing.md](spec/hmac-signing.md) for details and [spec/test-vectors.json](spec/test-vectors.json) for pre-computed test vectors.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
