# AI Labs Audit Tracker — Python Collector

Zero-dependency Python library for sending HMAC-SHA256 signed events to the AI Labs Audit API.

## Installation

```bash
pip install ailabsaudit-tracker
```

## Usage

```python
from ailabsaudit_tracker import AilabsTracker

tracker = AilabsTracker("TRK-00001", "your_api_secret")

# Track a page view
tracker.track_page_view("https://example.com/blog/article-1")

# Track a custom event with metadata
tracker.track(
    "cta_click",
    "https://example.com/pricing",
    meta={"button_id": "hero-signup"},
)
```

## Standalone HMAC signing

```python
from ailabsaudit_tracker import canonicalize, sign, signature_header

canonical = canonicalize(payload)
sig = sign(canonical, secret)           # hex string
header = signature_header(canonical, secret)  # "sha256=..."
```

## Tests

```bash
python tests/test_hmac.py
# or
python -m pytest tests/test_hmac.py -v
```

## Requirements

- Python 3.8+
- No external dependencies
