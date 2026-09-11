# Shopify App Proxy backend

Receives the requests Shopify forwards from `https://{shop}/apps/{subpath}/…`,
identifies the agent behind them, and sends the event to the AI Labs Audit
ingestion API using the same HMAC contract as every other collector.

## What it does, in order

1. **Verifies Shopify's proxy signature.** Shopify signs every forwarded request.
   Unsigned traffic did not come from a storefront, so it is refused with `403`
   and never counted — otherwise the measurement would include noise anyone could
   generate by guessing the URL.
2. **Serves the requested resource.** Real content, useful to both the merchant
   and an agent. A page that existed only to be counted would be dishonest, and
   an agent that followed the link once would not come back.
3. **Resolves the store's credentials.** Every shop signs with its own key: one
   merchant's data can never be written under another's `client_id`.
4. **Identifies the agent** by User-Agent, against the signature list refreshed
   from the API, falling back to the bundled defaults if that refresh fails.
5. **Sends the event** through `ctx.waitUntil`, so ingestion never delays the
   response served to the visitor.

## Routes

| path | variant | linked from |
|---|---|---|
| `/agents.md` | H | `<link rel="alternate">` in `<head>` |
| `/llms.txt` | H | same content, conventional alias |
| `/guide-agents` | B | a visible `<a>` in the page body |
| `/reference-agents` | control | **nothing** |

The variant travels with the event, so H, B and the control stay distinguishable
in the data. Without that, the whole experiment collapses into a single number.

The control is linked from nowhere on purpose: every request it receives came
from a client that guessed the path. That is the background noise the measured
variants have to beat before any result means anything.

## Configuration

    wrangler secret put SHOPIFY_APP_SECRET   # verifies proxy signatures
    wrangler secret put STORE_MAP            # per-store credentials, JSON

`STORE_MAP` maps a shop domain to its AI Labs Audit credentials:

    {"example.myshopify.com": {"client_id": "…", "api_key": "…", "api_secret": "…"}}

Beyond a handful of stores, bind a KV namespace called `STORES` instead, with one
JSON entry per shop domain. KV wins over `STORE_MAP` when both are present.

`API_URL` lives in `wrangler.toml`. Note that the HMAC signing path is always
`/api/v1/tracking/events` regardless of `API_URL`, because that is what the
server signs against.

**No credential ever reaches the storefront.** Nothing in Liquid, nothing in
page HTML, nothing in a public URL. They live here, server-side, only.

## What is not collected

No customer data, no order contents, no payment data, no visitor personal data,
**and no IP address is stored**. The event carries a timestamp, the path, the
declared User-Agent, the variant, and the store.

## Tests

    npm test

Eighteen tests, and they are checked by mutation rather than trusted: making the
signature check return `true` unconditionally fails four of them, relaxing the
constant-time comparison fails one, and breaking path routing fails another. A
suite that only exercised the happy path would pass against a function that
accepts everything.

## Requires

`shopify` must be present in the ingestion `plugin_type` enum server-side, or
every batch is rejected with `422` — the exact bug that silently blocked the
Cloudflare Worker.
