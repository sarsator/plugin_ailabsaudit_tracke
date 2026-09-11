# "Shopify AI Agent Monitor" Pilot — Participation Document

*AI Labs Audit · version 1.0 · [DATE] · Store: **[STORE NAME]***

## Why we're asking

We're testing an experimental feature that observes whether AI agents — the ones behind ChatGPT, Claude, Perplexity and similar services — actually visit technical entry points published on a Shopify store.

Let's be precise about what this is not. **We cannot see which pages of your store are being crawled.** Shopify doesn't allow it, and we don't claim otherwise. We only record requests to one technical address our app publishes on your store. This is a feasibility measurement, nothing more.

## Duration

From **[START DATE]** to **[ESTIMATED END DATE]**, roughly **[DURATION]**. You can stop at any time, without explanation and without notice.

## What gets installed

An AI Labs Audit test app for Shopify, which adds:

- an **App Embed** — a component rendered by Shopify's servers, which you switch on and off yourself from your theme editor;
- an **App Proxy** — a technical address served under your own domain, which receives the requests being measured.

Under normal operation, **no manual, permanent change to your theme code is required.**

## The two variants

**Variant H — invisible.** A technical reference is added to the `<head>` of your pages. Nothing about the display changes; a shopper sees no difference.

**Variant B — visible.** A discreet link appears on your store, typically near the bottom of the page, pointing to a resource intended for AI agents. **This link is visible to your shoppers.** We're flagging it explicitly, because it's the only part of the pilot that changes how your store looks.

Alongside these sits a **control address**: published, but linked from nowhere. It measures background noise from bots that guess addresses. It appears nowhere on your store and changes nothing.

If you accept both variants, the configuration may alternate between them during the test, to compare how readily each is picked up by AI agents.

## You can decline the visible variant

You can take part **with variant H only**, with no visible link at all. That's a fully legitimate choice, built into the protocol, and it doesn't make your participation any less useful.

## What we measure

For each request received: timestamp, store, path requested, declared User-Agent, the agent's identifier and category where recognisable, and the active variant.

## What we don't collect

- No customer data.
- No order contents.
- No payment data.
- No personal data about your visitors is used for the pilot.
- **No IP addresses are stored.**

To be exact on that last point: an IP address may be used temporarily, in memory, to verify a bot's declared identity when an official address range is published. **The raw IP address is not retained. Only the result of that check may be recorded.**

## What the pilot does not deliver

We expect no effect on your sales, nor on your store's perceived speed. No changes to your SEO rules or your `robots.txt` are planned.

**We guarantee no improvement in your visibility to AI systems.** This is a measurement experiment, not an optimisation service.

## Stopping and withdrawing

You can disable the App Embed from your theme editor, uninstall the app, or ask us to remove your store from the pilot, at any time. **This has no consequence for your AI Labs Audit account** or any other service you use.

## After uninstalling

Disabling stops the rendering; uninstalling closes the technical address. Shopify may retain technical configuration references in your theme after uninstallation. These affect neither display nor search ranking, but AI Labs Audit will assist you if you'd like a manual cleanup.

## Confidentiality of results

Results specific to your store remain confidential unless you agree otherwise. Aggregated, anonymised results may be used in the pilot's analysis. **No store name will be published without your explicit permission.**

## Contact

AI Labs Audit — AI Labs Solutions · [PILOT CONTACT EMAIL] · [PHONE]

---

## Response form

**1 — Participation**

☐ I agree to take part in the Shopify AI Agent Monitor pilot for the store **[STORE NAME]**.

**2 — Configuration choice** *(one answer only)*

☐ I accept both variants, **including variant B with a visible link** on my store.
☐ I take part **with variant H only**, with no visible link.

**3 — Option**

☐ I'd like to be notified before any visible change to my store.
*(not applicable if you chose variant H only)*

Name · Role · Date · Signature
Technical contact for installation: ________________
