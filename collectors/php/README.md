# AI Labs Audit Tracker — PHP Generic Collector

Zero-dependency PHP library for sending HMAC-SHA256 signed events to the AI Labs Audit API.

## Installation

```bash
composer require ailabsaudit/tracker
```

Or copy `src/AilabsTracker.php` directly.

## Usage

```php
use AilabsAudit\Tracker\AilabsTracker;

$tracker = new AilabsTracker('TRK-00001', 'your_api_secret');

// Auto-track page view (reads URL, referrer, UA, IP from $_SERVER)
$tracker->trackPageView();

// Track custom event
$tracker->trackEvent('cta_click', 'https://example.com/pricing', [
    'button_id' => 'hero-signup',
]);
```

## HMAC Signing

```php
// Standalone signing (for custom integrations)
$canonical = AilabsTracker::canonicalize($payload);
$signature = AilabsTracker::sign($canonical, $secret);
$header    = AilabsTracker::signatureHeader($canonical, $secret);
// => "sha256=abcdef..."
```

## Tests

```bash
php tests/HmacTest.php
```

## Requirements

- PHP 7.4+
- ext-curl, ext-json
