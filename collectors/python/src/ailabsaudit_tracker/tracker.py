"""
tracker.py — Core tracker: HMAC signing, HTTP transport.

Uses only the standard library (no external dependencies).

HMAC format: "{timestamp}\\n{method}\\n{path}\\n{body}"
"""

import hashlib
import hmac
import json
import ssl
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from .defaults import BOT_SIGNATURES, AI_REFERRERS


# -----------------------------------------------------------------
# HMAC signing
# -----------------------------------------------------------------

def sign(timestamp: str, method: str, path: str, body: str, secret: str) -> str:
    """Compute HMAC-SHA256 signature.

    Format: "{timestamp}\\n{method}\\n{path}\\n{body}"

    Returns lowercase hex string (64 chars).
    """
    string_to_sign = f"{timestamp}\n{method}\n{path}\n{body}"
    return hmac.new(
        secret.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def signature_header(timestamp: str, method: str, path: str, body: str, secret: str) -> str:
    """Build X-Signature header value (raw hex, no prefix)."""
    return sign(timestamp, method, path, body, secret)


# -----------------------------------------------------------------
# Tracker class
# -----------------------------------------------------------------

class AilabsTracker:
    """AI Labs Audit event tracker.

    Args:
        api_key: API key for X-API-Key header.
        api_secret: HMAC signing secret.
        client_id: Client identifier.
        api_url: API base URL.
        timeout: HTTP timeout in seconds.
    """

    VERSION = "1.0.0"
    # Override with your API domain.
    DEFAULT_API_URL = "https://YOUR_API_DOMAIN/api/v1"

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        client_id: str,
        api_url: str = DEFAULT_API_URL,
        timeout: int = 5,
        enable_detection: bool = False,
    ):
        self.api_key = api_key
        self.api_secret = api_secret
        self.client_id = client_id
        self.api_url = api_url.rstrip("/")
        self.timeout = timeout

        self._defaults_bot = BOT_SIGNATURES
        self._defaults_ref = AI_REFERRERS
        self._cache = None
        self._buffer = None

        if enable_detection:
            from .cache import ListCache
            from .buffer import EventBuffer

            self._cache = ListCache(
                api_url=self.api_url,
                api_key=self.api_key,
                api_secret=self.api_secret,
                sign_fn=sign,
            )
            self._buffer = EventBuffer(
                send_events=self.send_events,
            )
            self._cache.start()
            self._buffer.start()

    def shutdown(self) -> None:
        """Graceful shutdown — flush buffer and stop timers."""
        if self._cache:
            self._cache.stop()
        if self._buffer:
            self._buffer.shutdown()

    def send_events(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Send a batch of events to the API.

        Returns:
            dict with keys: success (bool), status_code (int), body (str).
        """
        payload = json.dumps({
            "client_id": self.client_id,
            "plugin_type": "python",
            "plugin_version": self.VERSION,
            "batch_id": str(uuid.uuid4()),
            "events": events,
        }, separators=(",", ":"), ensure_ascii=False)

        return self._send("POST", "/api/v1/tracking/events", "/tracking/events", payload)

    def verify_connection(self) -> Dict[str, Any]:
        """Verify API connection.

        Returns:
            dict with keys: success (bool), status_code (int), body (str).
        """
        payload = json.dumps({
            "tracking_api_key": self.api_key,
            "client_id": self.client_id,
            "plugin_type": "python",
            "plugin_version": self.VERSION,
        }, separators=(",", ":"), ensure_ascii=False)

        return self._send("POST", "/api/v1/tracking/verify", "/tracking/verify", payload)

    # -----------------------------------------------------------------
    # HTTP transport
    # -----------------------------------------------------------------

    def _send(self, method: str, hmac_path: str, url_path: str, body: str) -> Dict[str, Any]:
        """Send a signed request to the API."""
        timestamp = str(int(time.time()))
        nonce = str(uuid.uuid4())
        sig = sign(timestamp, method, hmac_path, body, self.api_secret)

        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "X-Timestamp": timestamp,
            "X-Nonce": nonce,
            "X-Signature": sig,
            "User-Agent": f"AilabsauditTracker/{self.VERSION} Python",
        }

        url = self.api_url + url_path
        body_bytes = body.encode("utf-8")
        req = Request(url, data=body_bytes, headers=headers, method=method)

        ssl_ctx = ssl.create_default_context()

        try:
            resp = urlopen(req, timeout=self.timeout, context=ssl_ctx)
            status_code = resp.getcode()
            resp_body = resp.read().decode("utf-8", errors="replace")
            return {
                "success": 200 <= status_code < 300,
                "status_code": status_code,
                "body": resp_body,
            }
        except HTTPError as exc:
            return {
                "success": False,
                "status_code": exc.code,
                "body": exc.read().decode("utf-8", errors="replace"),
            }
        except (URLError, OSError) as exc:
            return {
                "success": False,
                "status_code": 0,
                "body": str(exc),
            }
