# AI Labs Audit Tracker — PHP Generic Collector

Zero-dependency PHP library for detecting AI bot crawls and AI referral traffic. Sends HMAC-SHA256 signed event batches to the ingestion API.

## Installation

```bash
composer require ailabsaudit/tracker
```

Or copy `src/AilabsTracker.php` directly into your project.

## Usage

```php
use AilabsAudit\Tracker\AilabsTracker;

$tracker = new AilabsTracker(
    apiKey:    'your-api-key',
    apiSecret: 'your-hmac-secret',
    clientId:  'your-client-id',
    apiUrl:    'https://YOUR_API_DOMAIN/api/v1'
);

// Send a batch of events
$result = $tracker->sendEvents([
    [
        'type'        => 'bot_crawl',
        'user_agent'  => $_SERVER['HTTP_USER_AGENT'],
        'url'         => $_SERVER['REQUEST_URI'],
        'timestamp'   => gmdate('c'),
        'status_code' => http_response_code(),
        'response_size' => 0,
    ],
]);
// $result = ['success' => true, 'status_code' => 202, 'body' => '...']

// Verify API connection
$result = $tracker->verifyConnection();
```

## HMAC Signing

```php
// Standalone signing (for custom integrations)
$timestamp = (string) time();
$method    = 'POST';
$path      = '/api/v1/tracking/events';
$body      = json_encode($payload);

$signature = AilabsTracker::sign($timestamp, $method, $path, $body, $secret);
// => "a1b2c3..." (64-char hex, no prefix)
```

Signing format: `"{timestamp}\n{method}\n{path}\n{body}"` — no canonicalization, no key sorting.

## Tests

```bash
php tests/HmacTest.php
```

## Requirements

- PHP 7.4+
- ext-curl, ext-json
