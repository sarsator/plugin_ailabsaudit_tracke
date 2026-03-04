# API Endpoints Specification

Version: 1.0

## Base URL

```
https://api.ailabsaudit.com/v1
```

## Endpoints

### POST `/v1/collect`

Ingest a single tracking event.

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `X-Tracker-Id` | Yes | Tracker identifier |
| `X-Signature` | Yes | `sha256=<hmac_hex>` |
| `X-Timestamp` | Yes | ISO 8601 UTC |

**Request body:** See [payload-format.md](payload-format.md).

**Responses:**

| Status | Body | Description |
|--------|------|-------------|
| `202 Accepted` | `{"status":"accepted","id":"evt_..."}` | Event queued |
| `400 Bad Request` | `{"error":"invalid_payload","message":"..."}` | Malformed JSON or missing fields |
| `401 Unauthorized` | `{"error":"invalid_signature"}` | HMAC mismatch |
| `403 Forbidden` | `{"error":"tracker_disabled"}` | Tracker ID inactive |
| `408 Request Timeout` | `{"error":"timestamp_expired"}` | Replay protection |
| `413 Payload Too Large` | `{"error":"payload_too_large"}` | Exceeds 8 KB |
| `429 Too Many Requests` | `{"error":"rate_limited","retry_after":60}` | Rate limit exceeded |

### POST `/v1/collect/batch`

Ingest multiple events in a single request.

**Request body:**

```json
{
  "events": [
    { "event": "page_view", "timestamp": "...", "tracker_id": "...", "url": "..." },
    { "event": "cta_click", "timestamp": "...", "tracker_id": "...", "url": "..." }
  ]
}
```

- Maximum **25 events** per batch.
- The HMAC signature is computed over the entire body (the wrapper object).
- Each event must include all required fields.

**Responses:**

| Status | Body |
|--------|------|
| `202 Accepted` | `{"status":"accepted","count":2,"ids":["evt_...","evt_..."]}` |
| `207 Multi-Status` | `{"results":[{"index":0,"status":"accepted"},{"index":1,"status":"error","error":"..."}]}` |

### GET `/v1/health`

Health check endpoint. No authentication required.

**Response:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-03-04T12:00:00Z"
}
```

## Rate limits

| Plan | Requests/min | Batch events/min |
|------|-------------|-----------------|
| Free | 60 | 300 |
| Pro | 600 | 6 000 |
| Enterprise | Custom | Custom |

Rate-limited responses include a `Retry-After` header (seconds).

## CORS

The `/v1/collect` endpoint supports CORS for browser-based collectors (pixel tag):

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, X-Tracker-Id, X-Signature, X-Timestamp`
- `Access-Control-Allow-Methods: POST, OPTIONS`
