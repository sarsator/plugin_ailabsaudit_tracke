# Payload Format Specification

Version: 1.0

## Overview

All collectors send events as JSON objects to the AI Labs Audit ingestion API. This document defines the canonical payload schema.

## Schema

```json
{
  "event":      "string   (required) — event type",
  "timestamp":  "string   (required) — ISO 8601 UTC",
  "tracker_id": "string   (required) — assigned tracker identifier",
  "url":        "string   (required) — page URL",
  "referrer":   "string   (optional) — referrer URL",
  "user_agent": "string   (optional) — browser User-Agent",
  "ip":         "string   (optional) — client IP (may be anonymized)",
  "session_id": "string   (optional) — ephemeral session identifier",
  "meta":       "object   (optional) — arbitrary key-value metadata"
}
```

## Fields

### `event` (required)

Event type identifier. Reserved values:

| Value | Description |
|-------|-------------|
| `page_view` | Standard page view |
| `page_leave` | User navigated away |
| `cta_click` | Call-to-action click |
| `form_submit` | Form submission |
| `custom` | Custom event (use `meta.event_name` for details) |

Custom event names must be lowercase alphanumeric with underscores, max 64 characters.

### `timestamp` (required)

ISO 8601 format in UTC: `2026-03-04T12:00:00Z`.

### `tracker_id` (required)

Tracker identifier assigned by AI Labs Audit, format: `TRK-XXXXX`.

### `url` (required)

Full canonical URL of the tracked page. Must include protocol.

### `referrer` (optional)

The HTTP referrer, if available. Empty string or omitted if none.

### `user_agent` (optional)

Raw `User-Agent` header string.

### `ip` (optional)

Client IP address. Collectors MAY truncate the last octet for privacy (e.g., `192.168.1.0`).

### `session_id` (optional)

An ephemeral identifier to group events within a session. Must NOT be a persistent user identifier. Recommended: random UUID v4, regenerated per session.

### `meta` (optional)

Free-form JSON object for additional data. Examples:

```json
{
  "duration": 4500,
  "scroll_depth": 75,
  "button_id": "signup-hero",
  "web_vitals": {
    "lcp": 1200,
    "fid": 8,
    "cls": 0.05
  }
}
```

## Size limits

- Maximum payload size: **8 KB** (after JSON serialization)
- Maximum `meta` keys: **20**
- Maximum string value length in `meta`: **512 characters**

## Content-Type

All payloads must be sent as `application/json` with UTF-8 encoding.

## Canonicalization (for HMAC signing)

Before signing, the payload must be serialized with:
- Keys sorted alphabetically (recursive)
- No whitespace (`JSON_UNESCAPED_SLASHES`, compact separators)
- UTF-8 encoding

See [hmac-signing.md](hmac-signing.md) for the full signing procedure.
