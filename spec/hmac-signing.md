# HMAC-SHA256 Signing Specification

Version: 2.0

## Purpose

Every request to the ingestion API must include an HMAC-SHA256 signature so the server can verify the request was sent by an authorized collector and was not tampered with in transit.

## Algorithm

1. **Build the string to sign** by concatenating four components with newline (`\n`) separators:

   ```
   {timestamp}\n{method}\n{path}\n{body}
   ```

   | Component | Description | Example |
   |-----------|-------------|---------|
   | `timestamp` | Unix epoch seconds as a string | `1709553600` |
   | `method` | HTTP method in uppercase | `POST` or `GET` |
   | `path` | API path (not the full URL) | `/api/v1/tracking/events` |
   | `body` | Raw JSON body (empty string for GET requests) | `{"client_id":"CLT-001","events":[]}` |

2. **Compute** HMAC-SHA256:

   ```
   signature = HMAC-SHA256(secret, string_to_sign)
   ```

   - `secret`: the HMAC secret (UTF-8 encoded bytes)
   - `string_to_sign`: the concatenated string from step 1 (UTF-8 encoded bytes)
   - Output: lowercase hexadecimal string (64 characters)

3. **Attach** the signature in the HTTP header:

   ```
   X-Signature: <hex_signature>
   ```

   The signature is the raw hex string (64 chars). **No `sha256=` prefix.**

## Important: no canonicalization

The body is signed **as-is** — exactly as it will be sent over the wire. There is no key sorting, no re-serialization, no whitespace normalization. The signing input is the raw JSON string produced by your serializer.

## HTTP Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | Yes (POST) |
| `X-API-Key` | API key (from your dashboard) | Yes |
| `X-Timestamp` | Unix epoch seconds (e.g. `1709553600`) | Yes |
| `X-Nonce` | UUID v4 (e.g. `550e8400-e29b-41d4-a716-446655440000`) | Yes |
| `X-Signature` | Hex HMAC-SHA256 (64 chars) | Yes |

## Server-side verification

1. Extract `X-Timestamp` header and verify it is within ±5 minutes of server time (replay protection).
2. Extract `X-Nonce` header and verify it has not been seen before (replay protection).
3. Read the raw request body (do NOT parse and re-serialize).
4. Build the string to sign: `{X-Timestamp}\n{HTTP_METHOD}\n{request_path}\n{raw_body}`
5. Compute `HMAC-SHA256(secret, string_to_sign)`.
6. Compare the result with `X-Signature` using constant-time string comparison.

## Implementation examples

### PHP

```php
$timestamp = (string) time();
$method    = 'POST';
$path      = '/api/v1/tracking/events';
$body      = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$string_to_sign = $timestamp . "\n" . $method . "\n" . $path . "\n" . $body;
$signature = hash_hmac('sha256', $string_to_sign, $secret);
```

### Node.js

```js
const crypto = require('crypto');

const timestamp = String(Math.floor(Date.now() / 1000));
const method    = 'POST';
const path      = '/api/v1/tracking/events';
const body      = JSON.stringify(payload);

const stringToSign = `${timestamp}\n${method}\n${path}\n${body}`;
const signature = crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');
```

### Python

```python
import hmac, hashlib, time, json

timestamp = str(int(time.time()))
method    = 'POST'
path      = '/api/v1/tracking/events'
body      = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)

string_to_sign = f"{timestamp}\n{method}\n{path}\n{body}"
signature = hmac.new(secret.encode(), string_to_sign.encode(), hashlib.sha256).hexdigest()
```

### Cloudflare Worker (Web Crypto API)

```js
const encoder = new TextEncoder();

const timestamp = String(Math.floor(Date.now() / 1000));
const method    = 'POST';
const path      = '/api/v1/tracking/events';
const body      = JSON.stringify(payload);

const stringToSign = `${timestamp}\n${method}\n${path}\n${body}`;

const key = await crypto.subtle.importKey(
  'raw', encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
);
const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
const signature = Array.from(new Uint8Array(sig))
  .map(b => b.toString(16).padStart(2, '0')).join('');
```

## Error responses

| Status | Meaning |
|--------|---------|
| `401` | Missing or invalid signature, or missing API key |
| `403` | Client ID not found or disabled |
| `408` | Timestamp outside ±5 min window |

## Test vectors

See [test-vectors.json](test-vectors.json) for pre-computed HMAC signatures you can use to validate your implementation.
