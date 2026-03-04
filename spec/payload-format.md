# Payload Format Specification

Version: 2.0

## Overview

All collectors send events as JSON batches to the AI Labs Audit ingestion API. This document defines the payload schema.

## Batch wrapper

Every request to `POST /api/v1/tracking/events` sends a batch wrapper containing one or more events:

```json
{
  "client_id":      "string  (required) — client identifier",
  "plugin_type":    "string  (required) — collector type: wordpress, php, node, python, cloudflare",
  "plugin_version": "string  (required) — collector version (e.g. 1.0.0)",
  "batch_id":       "string  (required) — UUID v4 identifying this batch",
  "events":         "array   (required) — list of event objects (max 500)"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_id` | string | Yes | Client identifier (e.g. `CLT-001`) |
| `plugin_type` | string | Yes | Collector type: `wordpress`, `php`, `node`, `python`, `cloudflare` |
| `plugin_version` | string | Yes | Semantic version of the collector |
| `batch_id` | string | Yes | UUID v4, unique per batch |
| `events` | array | Yes | Array of event objects (1–500) |

## Event types

### `bot_crawl`

Detected when an AI bot user-agent is identified on a page request.

```json
{
  "type": "bot_crawl",
  "user_agent": "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
  "url": "/blog/article-1",
  "timestamp": "2026-03-04T12:00:00+00:00",
  "status_code": 200,
  "response_size": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Always `"bot_crawl"` |
| `user_agent` | string | Yes | Bot user-agent string (truncated to 500 chars) |
| `url` | string | Yes | Page URL / request URI (truncated to 2000 chars) |
| `timestamp` | string | Yes | ISO 8601 UTC (e.g. `2026-03-04T12:00:00+00:00`) |
| `status_code` | integer | Yes | HTTP response status code |
| `response_size` | integer | Yes | Response body size in bytes (0 if unknown) |

### `ai_referral`

Detected when a visitor arrives from an AI platform (via HTTP Referer header).

```json
{
  "type": "ai_referral",
  "referrer_domain": "chatgpt.com",
  "url": "/pricing",
  "timestamp": "2026-03-04T12:01:00+00:00"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Always `"ai_referral"` |
| `referrer_domain` | string | Yes | Matched AI platform domain |
| `url` | string | Yes | Page URL / request URI (truncated to 2000 chars) |
| `timestamp` | string | Yes | ISO 8601 UTC |

## Timestamp format

Event timestamps use ISO 8601 format in UTC, generated with:
- PHP: `gmdate('c')` — produces `2026-03-04T12:00:00+00:00`
- Node.js: `new Date().toISOString()` — produces `2026-03-04T12:00:00.000Z`
- Python: `datetime.now(timezone.utc).isoformat()` — produces `2026-03-04T12:00:00+00:00`

## Privacy

Events **must not** contain:
- IP addresses
- Cookies or session identifiers
- Any personally identifiable information (PII)
- Browser fingerprints

Only these data points are collected: bot user-agent, AI referrer domain/URL, page URL, timestamp, and HTTP status code.

## Size limits

- Maximum batch size: **500 events**
- Maximum `user_agent` length: **500 characters**
- Maximum URL/referrer length: **2000 characters**
- Maximum serialized payload size: **1 MB**

## Content-Type

All payloads must be sent as `application/json` with UTF-8 encoding.

## HMAC signing

The serialized JSON body is signed as-is — no canonicalization, no key sorting. See [hmac-signing.md](hmac-signing.md) for the full signing procedure.

## Full example

```json
{
  "client_id": "CLT-001",
  "plugin_type": "wordpress",
  "plugin_version": "1.0.0",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "events": [
    {
      "type": "bot_crawl",
      "user_agent": "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
      "url": "/blog/article-1",
      "timestamp": "2026-03-04T12:00:00+00:00",
      "status_code": 200,
      "response_size": 0
    },
    {
      "type": "ai_referral",
      "referrer_domain": "chatgpt.com",
      "url": "/pricing",
      "timestamp": "2026-03-04T12:01:00+00:00"
    }
  ]
}
```
