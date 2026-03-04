# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ailabsaudit-tracker** — monorepo of lightweight tracking collectors that send signed events to the AI Labs Audit ingestion API. Multi-platform: WordPress, PHP, Node.js, Python, Cloudflare Worker, browser pixel.

## Architecture

```
spec/                  ← Protocol specifications (payload, HMAC, API)
collectors/
  wordpress/           ← WordPress plugin (PHP)
  php/                 ← Generic PHP collector
  node/                ← Node.js collector
  python/              ← Python collector
  cloudflare-worker/   ← Cloudflare Worker (edge tracking)
  pixel/               ← Browser pixel tag (client-side)
integration-tests/     ← Cross-collector HMAC validation
```

All collectors share the same protocol: JSON payloads signed with HMAC-SHA256 (see `spec/`).

## Key conventions

- HMAC signing: keys sorted recursively, compact JSON (no whitespace), UTF-8, `sha256=<hex>` header format
- All server-side collectors expose 3 public signing functions: `canonicalize()`, `sign()`, `signatureHeader()`
- Pixel tag sends unsigned payloads (client-side, no secret exposure)
- WordPress plugin follows WPCS (WordPress Coding Standards)
- Commit messages: Conventional Commits with scopes (`wordpress`, `php`, `node`, `python`, `cloudflare`, `pixel`, `spec`, `ci`)

## Commands

### Run full integration test suite
```bash
bash integration-tests/run-all.sh
```

### Run individual collector tests
```bash
node collectors/node/tests/hmac.test.js
node collectors/cloudflare-worker/tests/hmac.test.js
node collectors/pixel/tests/tracker.test.js
python3 collectors/python/tests/test_hmac.py -v
php collectors/php/tests/HmacTest.php        # requires PHP 7.4+
```

### Cross-collector validation
```bash
node integration-tests/validate-vectors.js
python3 integration-tests/validate-vectors.py
```

## Important files

- `spec/test-vectors.json` — pre-computed HMAC signatures for cross-collector validation
- `collectors/php/src/AilabsTracker.php` — PHP collector (namespace `AilabsAudit\Tracker`)
- `collectors/node/src/index.js` — Node.js collector (CommonJS exports)
- `collectors/python/src/ailabsaudit_tracker/tracker.py` — Python collector
- `collectors/cloudflare-worker/src/worker.js` — CF Worker (Web Crypto API)
- `collectors/pixel/src/tracker.js` — Browser pixel tag
- `collectors/wordpress/ailabsaudit-tracker.php` — WordPress plugin entry point
