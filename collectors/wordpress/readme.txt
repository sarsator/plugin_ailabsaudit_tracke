=== AI Labs Audit Tracker ===
Contributors: ailabsaudit
Tags: ai, seo, bots, tracking, gptbot, claudebot, perplexity, aeo
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Track AI bot crawls and AI-generated referral traffic on your WordPress site.

== Description ==

AI Labs Audit Tracker detects when AI bots (GPTBot, ClaudeBot, PerplexityBot, and 50+ others) crawl your pages, and when visitors arrive from AI platforms like ChatGPT, Perplexity, Claude, or Gemini.

**What it tracks:**

* AI bot crawls — identifies the bot by its user-agent string
* AI referral visits — detects when traffic comes from AI platforms (20+ domains)

**What it does NOT track:**

* No IP addresses
* No cookies
* No personal data
* No browser fingerprints

**How it works:**

1. On each page load, the plugin checks User-Agent and Referer headers (less than 1ms)
2. Detected events are buffered locally in a WordPress transient (with lock protection)
3. Every 5 minutes, events are sent via HMAC-SHA256 signed API call
4. Bot signatures and referrer lists are refreshed daily from the API

**Security features:**

* HMAC-SHA256 signed requests (no secrets exposed)
* HTTPS-only API communication
* SSRF protection on API URL configuration
* CSRF nonce on admin AJAX actions
* Rate-limited test connection
* Debounced flush to prevent amplification

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/` or install via WordPress plugin installer
2. Activate through the Plugins menu
3. Go to **Settings > AI Labs Audit** and enter your API Key, HMAC Secret, Client ID, and API URL
4. Click **Test Connection** to verify

== Frequently Asked Questions ==

= Does this plugin slow down my site? =
No. Detection takes less than 1ms per page load. Data is sent asynchronously via WP-Cron, never during page rendering.

= What data is collected? =
Only bot user-agent strings, AI referrer domains, page URLs, timestamps, and HTTP status codes. Zero personal data.

= Does it work with caching plugins? =
Works with object caching (Redis, Memcached). Full page caching may reduce detection since cached pages bypass PHP.

= Is it GDPR compliant? =
Yes. The plugin does not collect any personal data (no IP, no cookies, no PII).

= Where do I get my API credentials? =
API Key, HMAC Secret, and Client ID are provided in your dashboard when you register your site.

== Changelog ==

= 1.0.0 =
* Initial release
* 50+ AI bot signatures (GPTBot, ClaudeBot, PerplexityBot, bingbot, Bytespider, and more)
* 20+ AI referrer domains (ChatGPT, Perplexity, Claude, Gemini, Copilot, and more)
* HMAC-SHA256 signed API requests
* WP-Cron async batch sending every 5 minutes
* Transient-based event buffer with lock protection
* Auto-refresh bot signatures and referrer lists every 24h (with ETag support)
* Admin settings page with connection test
* Zero personal data — fully GDPR compliant
