# AI Labs Audit Tracker — JavaScript Pixel Tag

Lightweight client-side tracker (<2 KB). Drop a single `<script>` tag to track page views, custom events, scroll depth, and session duration.

## Quick start

```html
<script
  src="/path/to/tracker.js"
  data-tracker-id="YOUR_TRACKER_ID"
  data-api-url="https://YOUR_API_DOMAIN/api/v1/collect"
></script>
```

Page views are tracked automatically.

## Configuration (data attributes)

| Attribute | Description | Default |
|-----------|-------------|---------|
| `data-tracker-id` | Your tracker ID (required) | — |
| `data-api-url` | Ingestion endpoint (required) | — |
| `data-auto-track` | Auto-track page views | `true` |

## Custom events

```js
// Programmatic
ailabsaudit.track('cta_click', { button_id: 'hero-signup' });

// Declarative (HTML data attributes)
<button
  data-ailabsaudit-event="cta_click"
  data-ailabsaudit-meta='{"button_id":"hero"}'
>Sign Up</button>
```

## What it tracks automatically

- **page_view** — on page load
- **page_leave** — on unload, with `duration` (ms) and `scroll_depth` (%)
- **click events** — on elements with `data-ailabsaudit-event`

## Security note

This pixel sends unsigned payloads (HMAC secrets cannot be exposed client-side). The API validates the tracker by origin domain. For signed payloads, use a server-side collector.

## Tests

```bash
node tests/tracker.test.js
```
