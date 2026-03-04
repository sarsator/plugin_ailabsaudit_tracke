# Integration Tests

Cross-collector validation to ensure all collectors produce identical HMAC-SHA256 signatures for the same inputs.

## Run all tests

```bash
bash integration-tests/run-all.sh
```

## Run individual validators

```bash
# Node.js + Cloudflare Worker cross-check
node integration-tests/validate-vectors.js

# Python validator
python3 integration-tests/validate-vectors.py
```

## What gets tested

- Each collector's `sign(timestamp, method, path, body, secret)` output matches `spec/test-vectors.json`
- Cross-collector consistency: all collectors produce identical signatures for the same inputs
- All 5 test vectors: batch_events_empty, batch_events_one_bot, verify_connection, get_bot_signatures, get_ai_referrers
- Signing format: `"{timestamp}\n{method}\n{path}\n{body}"` — no canonicalization, raw hex output
