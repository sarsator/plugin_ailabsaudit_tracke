/**
 * AI Labs Audit Tracker — Frontend tracking script.
 *
 * Sends custom events via AJAX to the WordPress backend,
 * which then forwards them to the AI Labs Audit API.
 */
(function () {
	'use strict';

	if (typeof ailabsauditTracker === 'undefined') {
		return;
	}

	var config = ailabsauditTracker;

	/**
	 * Send a custom event.
	 *
	 * @param {string} eventName - Event type (e.g. "cta_click", "form_submit").
	 * @param {Object} [meta]    - Optional metadata key-value pairs.
	 */
	function trackEvent(eventName, meta) {
		var data = new FormData();
		data.append('action', 'ailabsaudit_event');
		data.append('nonce', config.nonce);
		data.append('event_name', eventName);
		data.append('url', window.location.href);

		if (meta && typeof meta === 'object') {
			Object.keys(meta).forEach(function (key) {
				data.append('meta[' + key + ']', String(meta[key]));
			});
		}

		if (navigator.sendBeacon) {
			navigator.sendBeacon(config.ajaxUrl, data);
		} else {
			var xhr = new XMLHttpRequest();
			xhr.open('POST', config.ajaxUrl, true);
			xhr.send(data);
		}
	}

	/**
	 * Auto-track clicks on elements with data-ailabsaudit-event attribute.
	 *
	 * Usage:
	 *   <button data-ailabsaudit-event="cta_click" data-ailabsaudit-meta='{"button_id":"hero"}'>
	 *     Sign Up
	 *   </button>
	 */
	document.addEventListener('click', function (e) {
		var el = e.target.closest('[data-ailabsaudit-event]');
		if (!el) {
			return;
		}

		var eventName = el.getAttribute('data-ailabsaudit-event');
		var meta = {};

		try {
			var raw = el.getAttribute('data-ailabsaudit-meta');
			if (raw) {
				meta = JSON.parse(raw);
			}
		} catch (err) {
			// Ignore invalid JSON in data attribute.
		}

		trackEvent(eventName, meta);
	});

	// Expose global API.
	window.ailabsaudit = { track: trackEvent };
})();
