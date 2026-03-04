# AI Labs Audit Tracker — WordPress Collector

## Installation

1. Copy this directory to `wp-content/plugins/ailabsaudit-tracker/`
2. Activate in **Plugins → Installed Plugins**
3. Configure in **Settings → AI Labs Audit Tracker**

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| Tracker ID | Your `TRK-XXXXX` identifier | — |
| API Secret | HMAC signing secret | — |
| API Endpoint | Ingestion URL | `https://api.ailabsaudit.com/v1/collect` |
| Track admin | Track logged-in admins | No |
| Anonymize IP | Zero last IP octet | Yes |

## Custom events (JavaScript)

```js
// Programmatic
ailabsaudit.track('cta_click', { button_id: 'hero-signup' });

// Declarative (HTML data attributes)
// <button data-ailabsaudit-event="cta_click" data-ailabsaudit-meta='{"button_id":"hero"}'>
```

## Requirements

- WordPress 5.6+
- PHP 7.4+
