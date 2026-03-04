# API Endpoints Specification

Version: 2.0

## Base URL

```
https://YOUR_API_DOMAIN/api/v1
```

> Replace `YOUR_API_DOMAIN` with the domain provided in your dashboard.
> Each collector accepts a configurable API URL (see collector documentation).

## Authentication

All endpoints require HMAC-SHA256 signed requests (see [hmac-signing.md](hmac-signing.md)).

**Required headers on every request:**

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes (POST) | `application/json` |
| `X-API-Key` | Yes | API key identifying the client |
| `X-Timestamp` | Yes | Unix epoch seconds (e.g. `1709553600`) |
| `X-Nonce` | Yes | UUID v4 for replay protection |
| `X-Signature` | Yes | HMAC-SHA256 hex signature (64 chars, no prefix) |
| `User-Agent` | Recommended | Collector identifier (e.g. `AilabsauditTracker/1.0.0 WordPress/6.7`) |

## Endpoints

### POST `/api/v1/tracking/events`

Submit a batch of tracking events.

**Request body:**

```json
{
  "client_id": "your-client-id",
  "plugin_type": "wordpress",
  "plugin_version": "1.0.0",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "events": [
    {
      "type": "bot_crawl",
      "user_agent": "Mozilla/5.0 (compatible; GPTBot/1.0)",
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

- Maximum **500 events** per batch.
- The HMAC signature is computed over the entire serialized JSON body.
- The body is signed as-is (no canonicalization, no key sorting).

**Responses:**

| Status | Body | Description |
|--------|------|-------------|
| `202 Accepted` | `{"status":"accepted","batch_id":"...","count":2}` | Batch queued |
| `400 Bad Request` | `{"error":"invalid_payload","message":"..."}` | Malformed JSON or missing fields |
| `401 Unauthorized` | `{"error":"invalid_signature"}` | HMAC mismatch or missing API key |
| `403 Forbidden` | `{"error":"client_disabled"}` | Client ID inactive |
| `429 Too Many Requests` | `{"error":"rate_limited","retry_after":60}` | Rate limit exceeded |
| `5xx` | `{"error":"server_error"}` | Server-side error (retry) |

### POST `/api/v1/tracking/verify`

Verify API connection and credentials.

**Request body:**

```json
{
  "tracking_api_key": "your-api-key",
  "client_id": "your-client-id",
  "domain": "https://example.com",
  "plugin_type": "wordpress",
  "plugin_version": "1.0.0"
}
```

**Responses:**

| Status | Body | Description |
|--------|------|-------------|
| `200 OK` | `{"status":"connected","message":"..."}` | Credentials valid |
| `401 Unauthorized` | `{"error":"invalid_credentials"}` | API key or HMAC invalid |

### GET `/api/v1/bot-signatures`

Retrieve the current list of AI bot user-agent patterns.

**Additional headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `If-None-Match` | No | ETag from previous response for conditional fetch |

**Response (200):**

```json
{
  "signatures": [
    {"pattern": "GPTBot"},
    {"pattern": "ClaudeBot"},
    {"pattern": "PerplexityBot"}
  ]
}
```

**Response (304):** Not Modified — cached version is still current.

The response includes an `ETag` header for conditional requests.

### GET `/api/v1/ai-referrers`

Retrieve the current list of AI referrer domains.

**Additional headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `If-None-Match` | No | ETag from previous response for conditional fetch |

**Response (200):**

```json
{
  "referrers": [
    {"domain": "chatgpt.com"},
    {"domain": "claude.ai"},
    {"domain": "perplexity.ai"}
  ]
}
```

**Response (304):** Not Modified — cached version is still current.

### GET `/api/v1/health`

Health check endpoint. No authentication required.

**Response:**

```json
{
  "status": "ok",
  "version": "2.0.0",
  "timestamp": "2026-03-04T12:00:00Z"
}
```

## Rate limits

| Plan | Requests/min | Events/min |
|------|-------------|------------|
| Free | 60 | 3 000 |
| Pro | 600 | 30 000 |
| Enterprise | Custom | Custom |

Rate-limited responses include a `Retry-After` header (seconds).

## CORS

The pixel collector (browser-side) requires CORS support:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Signature, X-Timestamp, X-Nonce`
- `Access-Control-Allow-Methods: POST, OPTIONS`
