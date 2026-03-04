/**
 * AI Labs Audit Tracker — JavaScript Pixel Tag
 *
 * Lightweight client-side tracker (<2 KB minified).
 * Drop a single <script> tag to track page views and custom events.
 *
 * NOTE: Client-side HMAC signing requires exposing the secret in the browser.
 * For production, prefer server-side collectors or a signing proxy.
 * This pixel sends unsigned payloads; the server identifies the tracker
 * via X-Tracker-Id and validates the origin domain.
 *
 * Usage:
 *   <script
 *     src="/path/to/tracker.js"
 *     data-tracker-id="YOUR_TRACKER_ID"
 *     data-api-url="https://YOUR_API_DOMAIN/api/v1/collect"
 *   ></script>
 */
(function () {
  'use strict';

  // -----------------------------------------------------------------
  // Configuration from script tag data attributes
  // -----------------------------------------------------------------

  var scriptTag = document.currentScript;
  if (!scriptTag) {
    // Fallback for older browsers / async loading
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].getAttribute('data-tracker-id')) {
        scriptTag = scripts[i];
        break;
      }
    }
  }
  if (!scriptTag) return;

  var config = {
    trackerId: scriptTag.getAttribute('data-tracker-id') || '',
    apiUrl: scriptTag.getAttribute('data-api-url') || '',
    autoTrack: scriptTag.getAttribute('data-auto-track') !== 'false',
  };

  if (!config.trackerId || !config.apiUrl) return;

  // -----------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------

  function isoNow() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function generateSessionId() {
    var arr = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      // Non-crypto fallback: unique but not security-critical.
      return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 8);
    }
    var hex = '';
    for (var j = 0; j < arr.length; j++) {
      hex += ('0' + arr[j].toString(16)).slice(-2);
    }
    return hex;
  }

  var sessionId = generateSessionId();

  // -----------------------------------------------------------------
  // Send event
  // -----------------------------------------------------------------

  /**
   * Send a tracking event to the API.
   * Uses sendBeacon when available (survives page unload),
   * falls back to XHR.
   *
   * @param {Object} payload JSON-serializable payload.
   */
  function send(payload) {
    var body = JSON.stringify(payload);

    // Prefer sendBeacon for reliability on page unload
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(config.apiUrl, blob);
      return;
    }

    // XHR fallback
    var xhr = new XMLHttpRequest();
    xhr.open('POST', config.apiUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Tracker-Id', config.trackerId);
    xhr.setRequestHeader('X-Timestamp', payload.timestamp || isoNow());
    xhr.send(body);
  }

  // -----------------------------------------------------------------
  // Build payload
  // -----------------------------------------------------------------

  /**
   * Sanitize metadata: limit keys and string lengths.
   * @param {Object} meta Raw metadata.
   * @returns {Object} Sanitized metadata.
   */
  function sanitizeMeta(meta) {
    var clean = {};
    var keys = Object.keys(meta).slice(0, 20);
    for (var i = 0; i < keys.length; i++) {
      var val = meta[keys[i]];
      if (typeof val === 'string') {
        clean[keys[i]] = val.substring(0, 500);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        clean[keys[i]] = val;
      }
    }
    return clean;
  }

  /**
   * Build a tracking payload.
   *
   * @param {string} event Event type.
   * @param {Object} [meta] Optional metadata.
   * @returns {Object}
   */
  function buildPayload(event, meta) {
    var payload = {
      event: event,
      timestamp: isoNow(),
      tracker_id: config.trackerId,
      url: window.location.href,
    };

    if (document.referrer) {
      payload.referrer = document.referrer;
    }

    if (navigator.userAgent) {
      payload.user_agent = navigator.userAgent;
    }

    payload.session_id = sessionId;

    if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
      payload.meta = sanitizeMeta(meta);
    }

    return payload;
  }

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------

  /**
   * Track a custom event.
   *
   * @param {string} eventName Event type (e.g. "cta_click").
   * @param {Object} [meta] Optional metadata.
   */
  function track(eventName, meta) {
    send(buildPayload(eventName, meta));
  }

  /**
   * Track a page view.
   */
  function trackPageView() {
    send(buildPayload('page_view'));
  }

  // -----------------------------------------------------------------
  // Auto-tracking
  // -----------------------------------------------------------------

  // Auto-track page view on load
  if (config.autoTrack) {
    trackPageView();
  }

  // Auto-track clicks on data-attributed elements
  document.addEventListener('click', function (e) {
    var el = e.target;
    // Walk up to find the attributed element (max 5 levels)
    for (var depth = 0; depth < 5 && el && el !== document; depth++) {
      var eventName = el.getAttribute && el.getAttribute('data-ailabsaudit-event');
      if (eventName) {
        var meta = {};
        try {
          var raw = el.getAttribute('data-ailabsaudit-meta');
          if (raw) meta = JSON.parse(raw);
        } catch (err) { /* ignore */ }
        track(eventName, meta);
        return;
      }
      el = el.parentElement;
    }
  });

  // Track page leave (duration + scroll depth)
  var pageLoadTime = Date.now();
  var maxScrollDepth = 0;

  window.addEventListener('scroll', function () {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ) - window.innerHeight;
    if (docHeight > 0) {
      var depth = Math.round((scrollTop / docHeight) * 100);
      if (depth > maxScrollDepth) maxScrollDepth = depth;
    }
  });

  // Send page_leave on unload
  function onPageLeave() {
    var duration = Date.now() - pageLoadTime;
    track('page_leave', {
      duration: duration,
      scroll_depth: maxScrollDepth,
    });
  }

  // Use pagehide (preferred) with visibilitychange fallback
  if ('onpagehide' in window) {
    window.addEventListener('pagehide', onPageLeave);
  } else {
    window.addEventListener('beforeunload', onPageLeave);
  }

  // Expose global API
  window.ailabsaudit = {
    track: track,
    trackPageView: trackPageView,
  };
})();
