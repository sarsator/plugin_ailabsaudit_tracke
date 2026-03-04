=== AI Labs Audit Tracker ===
Contributors: ailabssolutions
Tags: analytics, tracking, audit, ai
Requires at least: 5.6
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Lightweight tracking collector for AI Labs Audit — captures page views and events with HMAC-SHA256 signed payloads.

== Description ==

AI Labs Audit Tracker is a privacy-first analytics collector that sends page view and event data to the AI Labs Audit platform. Every payload is signed with HMAC-SHA256 to ensure authenticity and integrity.

Features:

* Automatic page view tracking on the frontend
* Custom event tracking via JavaScript API or HTML data attributes
* HMAC-SHA256 payload signing
* IP anonymization (enabled by default)
* Non-blocking HTTP requests (does not slow down your site)
* Cloudflare / reverse proxy IP detection

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/ailabsaudit-tracker/`.
2. Activate the plugin through the "Plugins" menu in WordPress.
3. Go to Settings → AI Labs Audit Tracker.
4. Enter your Tracker ID and API Secret.

== Frequently Asked Questions ==

= Where do I get my Tracker ID? =

Sign up at ailabsaudit.com and create a tracker for your website.

= Does this slow down my site? =

No. Tracking requests are sent asynchronously with non-blocking HTTP.

= Is visitor IP stored? =

By default, IP anonymization is enabled — the last octet is zeroed.

== Changelog ==

= 1.0.0 =
* Initial release
