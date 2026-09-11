# Shopify collector — experimental, measurement only

> **Status: not a working collector.** This directory holds the instrumentation
> for a measurement pilot, not a production collector. Do not present it as
> feature parity with the WordPress, PHP, Python, log-agent or Cloudflare Worker
> collectors. It is not one, and it may never become one.

## Why this is not a normal collector

The five existing collectors sit in the request path and see **every** request
hitting the site. On Shopify's hosted platform, nothing can. Measured on a
development store:

- Liquid has no access to the User-Agent. The `request` object exposes `host`,
  `path`, `page_type`, `design_mode`, `locale` and `origin` — never
  `user_agent`. No storefront template can identify a bot on its own.
- An **App Proxy** backend *does* receive the visitor's User-Agent intact, along
  with `X-Forwarded-For` and Shopify's HMAC signature. It is the only place in
  the ecosystem where the raw User-Agent is available without JavaScript.
- But the App Proxy only ever sees `/apps/<subpath>`. Six storefront URLs were
  requested (home, product, collection, page, blog, 404) and **zero** reached the
  proxy. It is not middleware.
- Overriding `templates/robots.txt.liquid` **breaks** the file:
  `robots.default_groups` does not return the native `Allow:` directives nor the
  commented preamble. Never ship that.

So a Shopify collector cannot observe crawls of the store's pages. It can only
observe requests to an address it publishes itself — and whether AI agents follow
such a link, from a page they have already crawled, **is not known**. That single
unknown is what the pilot measures.

## What this directory contains

A Shopify Theme App Extension with two app embed blocks, rendered server-side by
Shopify so that a crawler executing no JavaScript still sees them:

| file | variant | rendered |
|---|---|---|
| `blocks/pilote_head.liquid` | **H** | `<link rel="alternate">` inside `<head>` — invisible to shoppers |
| `blocks/pilote_body.liquid` | **B** | a visible `<a>` link near the end of `<body>` |

A third address — the **control** — is deliberately published without any block:
nothing links to it. It measures background noise from bots that guess paths.
Without it, requests from path-guessing scanners would be miscounted as agents
following the link.

Both blocks take the App Proxy subpath as a setting, so one extension serves any
store. Neither contains a secret: these files are served publicly by Shopify.

## Rules this code must keep

- **No JavaScript for detection.** Crawlers do not execute it.
- **No hidden link.** Variant B carries no `display:none`, no off-screen text, no
  `font-size:0`, no `aria-hidden`. A merchant must be able to see what was added
  to their store, and have it explained to them.
- **Never invent what Shopify does not provide.** An unrecognised agent is
  reported as *bot detected, identity unknown* — never attributed by name.
- **No API key in Liquid, in the storefront, or in any public URL.**

## Installation notes

App embeds are **disabled by default**: a merchant activates each block from the
theme editor. Two behaviours worth knowing, both measured:

- After uninstalling the app, Shopify keeps the blocks declared in
  `config/settings_data.json` with `disabled: false`, which leaves
  `Failed to render app block` HTML comments on every page until they are removed
  by hand. Harmless for display and SEO, but visible in the source.
- After **re**installing, rendering stayed inconsistent for at least 50 minutes —
  around 72 % of requests served the embeds, the rest served the stale error
  comments. Not a CDN cache (`cf-cache-status: DYNAMIC`); Shopify application
  servers hold divergent extension definitions. Treat
  `config/settings_data.json` as the source of truth, never a single HTML read.

## The backend

`backend/` is the App Proxy collector: it verifies Shopify's proxy signature,
serves the entry points, identifies the agent by User-Agent and sends the event
to the AI Labs Audit ingestion API under `plugin_type: "shopify"`, using the same
HMAC contract as the other collectors. See `backend/README.md`.

## The pilot

`pilot/` holds what the measurement pilot needs, and nothing that identifies a
merchant:

- `pilot/consent/` — merchant consent templates in six languages, plus
  `verify_parity.py`, which enforces that all fifteen substantive commitments
  appear in every language.
- `pilot/COHORTS.md` — the cohort rule. Merchants accepting both variants form
  the crossover cohort and are the only ones feeding the causal H-vs-B
  comparison; merchants declining the visible variant stay in the pilot for H
  feasibility but never enter that comparison. A refusal is never compensated by
  altering the randomisation of other stores.

Store names, cohort assignment and responses are operational data and live
outside this repository.

## What is deliberately absent

No backend, no onboarding, no billing, no dashboard, and no `shopify` value added
to the ingest `plugin_type` enum. None of that is justified until the pilot has
answered whether agents follow the link at all.
