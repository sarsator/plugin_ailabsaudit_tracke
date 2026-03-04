# Integration Tests

Cross-collector validation to ensure all collectors produce identical HMAC-SHA256 signatures for the same payloads.

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

- Each collector's `canonicalize()` output matches `spec/test-vectors.json`
- Each collector's `sign()` output matches the expected HMAC signatures
- Cross-collector consistency: Node.js and CF Worker produce identical canonical JSON
- All 3 test vectors: minimal_page_view, full_page_view, cta_click_event
