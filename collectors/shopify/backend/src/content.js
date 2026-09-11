/**
 * What we actually serve at the entry points.
 *
 * These pages are not decoys. A merchant can read them, an agent can use them,
 * and they say plainly what the store offers and where its machine-readable
 * data lives. Serving an empty page that exists only to be counted would be
 * dishonest, and an agent that followed the link once would not return.
 */

/**
 * @param {string} shopDomain
 * @param {string} origin Public origin of the storefront.
 * @returns {string} Markdown.
 */
export function agentsMarkdown(shopDomain, origin) {
  return `# ${shopDomain}

Information for AI agents and crawlers visiting this Shopify store.

## Structured data

- Products: ${origin}/collections/all
- Sitemap: ${origin}/sitemap.xml
- Product data: append \`.json\` to any product URL

## Policies

- Shipping, returns and terms: ${origin}/policies

## About this page

This page is published by the AI Labs Audit app on behalf of the merchant. It
exists so that agents have a single, stable entry point describing the store.

Requests to it are logged — timestamp, path, declared User-Agent, and the agent
identifier when it can be recognised. No IP address is stored. No customer,
order or payment data is involved.
`;
}

/**
 * The control resource. It is linked from nowhere, so every request to it comes
 * from a client that guessed the path. That number is the background noise the
 * measured variants have to beat before any result means anything.
 */
export function controlMarkdown(shopDomain, origin) {
  return `# ${shopDomain}

Reference information for AI agents.

- Products: ${origin}/collections/all
- Sitemap: ${origin}/sitemap.xml
- Policies: ${origin}/policies

Published by the AI Labs Audit app on behalf of the merchant. Requests are
logged without storing any IP address.
`;
}
