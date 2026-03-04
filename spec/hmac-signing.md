# HMAC-SHA256 Signing Specification

Version: 1.0

## Purpose

Every request to the ingestion API must include an HMAC-SHA256 signature so the server can verify the payload was sent by an authorized collector and was not tampered with in transit.

## Algorithm

1. **Canonicalize** the JSON payload:
   - Sort all keys alphabetically (recursively for nested objects)
   - Serialize with compact separators (no spaces): `separators=(',', ':')`
   - Use UTF-8 encoding

2. **Compute** HMAC-SHA256:
   ```
   signature = HMAC-SHA256(secret, canonical_payload)
   ```
   - `secret`: the API secret (UTF-8 encoded bytes)
   - `canonical_payload`: the canonicalized JSON string (UTF-8 encoded bytes)
   - Output: lowercase hexadecimal string (64 characters)

3. **Attach** the signature in the HTTP header:
   ```
   X-Signature: sha256=<hex_signature>
   ```

## HTTP Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | Yes |
| `X-Tracker-Id` | Tracker ID (e.g., `TRK-001`) | Yes |
| `X-Signature` | `sha256=<hex_signature>` | Yes |
| `X-Timestamp` | ISO 8601 UTC (e.g., `2026-03-04T12:00:00Z`) | Yes |

## Server-side verification

1. Extract `X-Signature` header, strip `sha256=` prefix.
2. Read the raw request body (do NOT parse and re-serialize).
3. Compute `HMAC-SHA256(secret, raw_body)`.
4. Compare using constant-time string comparison.
5. Verify `X-Timestamp` is within ±5 minutes of server time (replay protection).

## Implementation examples

### PHP
```php
$signature = hash_hmac('sha256', $canonical_json, $secret);
```

### Node.js
```js
const crypto = require('crypto');
const signature = crypto.createHmac('sha256', secret).update(canonicalJson).digest('hex');
```

### Python
```python
import hmac, hashlib
signature = hmac.new(secret.encode(), canonical_json.encode(), hashlib.sha256).hexdigest()
```

## Error responses

| Status | Meaning |
|--------|---------|
| `401` | Missing or invalid signature |
| `403` | Tracker ID not found or disabled |
| `408` | Timestamp outside ±5 min window |
| `413` | Payload exceeds 8 KB |

## Test vectors

See [test-vectors.json](test-vectors.json) for pre-computed HMAC signatures you can use to validate your implementation.
