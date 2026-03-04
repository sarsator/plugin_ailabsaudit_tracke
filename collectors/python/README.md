# AI Labs Audit Tracker — Python Collector

Zero-dependency Python library for detecting AI bot crawls and AI referral traffic. Sends HMAC-SHA256 signed event batches to the ingestion API.

## Installation

```bash
pip install ailabsaudit-tracker
```

Or copy `src/ailabsaudit_tracker/tracker.py` directly into your project.

## Usage

```python
from ailabsaudit_tracker import AilabsTracker

tracker = AilabsTracker(
    api_key="your-api-key",
    api_secret="your-hmac-secret",
    client_id="your-client-id",
    api_url="https://YOUR_API_DOMAIN/api/v1",
)

# Send a batch of events
result = tracker.send_events([
    {
        "type": "bot_crawl",
        "user_agent": "GPTBot/1.0",
        "url": "/blog/article-1",
        "timestamp": "2026-03-04T12:00:00+00:00",
        "status_code": 200,
        "response_size": 0,
    },
])
# result = {"success": True, "status_code": 202, "body": "..."}

# Verify API connection
result = tracker.verify_connection()
```

## HMAC Signing

```python
from ailabsaudit_tracker import sign, signature_header

timestamp = str(int(time.time()))
sig = sign(timestamp, "POST", "/api/v1/tracking/events", body, secret)
# => "a1b2c3..." (64-char hex, no prefix)
```

Signing format: `"{timestamp}\n{method}\n{path}\n{body}"` — no canonicalization, no key sorting.

## Tests

```bash
python3 tests/test_hmac.py -v
```

## Requirements

- Python 3.8+
- No external dependencies (stdlib only)
