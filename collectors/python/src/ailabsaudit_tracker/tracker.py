"""
tracker.py — Core tracker: canonicalization, HMAC signing, HTTP transport.

Uses only the standard library (no external dependencies).
"""

import hashlib
import hmac
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


# -----------------------------------------------------------------
# Canonicalization & HMAC signing
# -----------------------------------------------------------------

def _sort_recursive(data: Any) -> Any:
    """Recursively sort dict keys alphabetically. Lists preserved as-is."""
    if isinstance(data, dict):
        return {k: _sort_recursive(v) for k, v in sorted(data.items())}
    if isinstance(data, list):
        return [_sort_recursive(item) for item in data]
    return data


def canonicalize(payload: Dict[str, Any]) -> str:
    """Canonicalize a payload dict into a deterministic JSON string.

    Keys sorted recursively, compact separators, UTF-8.
    """
    sorted_payload = _sort_recursive(payload)
    return json.dumps(sorted_payload, separators=(",", ":"), ensure_ascii=False)


def sign(canonical_json: str, secret: str) -> str:
    """Compute HMAC-SHA256 signature. Returns lowercase hex (64 chars)."""
    return hmac.new(
        secret.encode("utf-8"),
        canonical_json.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def signature_header(canonical_json: str, secret: str) -> str:
    """Build X-Signature header value: 'sha256=<hex>'."""
    return "sha256=" + sign(canonical_json, secret)


# -----------------------------------------------------------------
# Tracker class
# -----------------------------------------------------------------

class AilabsTracker:
    """AI Labs Audit event tracker.

    Args:
        tracker_id: Tracker ID (e.g. "TRK-00001").
        api_secret: HMAC signing secret.
        api_url: API endpoint URL.
        timeout: HTTP timeout in seconds.
        anonymize_ip: Zero last IPv4 octet.
    """

    DEFAULT_API_URL = "https://api.ailabsaudit.com/v1/collect"

    def __init__(
        self,
        tracker_id: str,
        api_secret: str,
        api_url: str = DEFAULT_API_URL,
        timeout: int = 5,
        anonymize_ip: bool = True,
    ):
        self.tracker_id = tracker_id
        self.api_secret = api_secret
        self.api_url = api_url
        self.timeout = timeout
        self.anonymize_ip = anonymize_ip

    def track(
        self,
        event: str,
        url: str,
        referrer: Optional[str] = None,
        user_agent: Optional[str] = None,
        ip: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Track an event.

        Returns:
            dict with keys: success (bool), status_code (int), body (str).
        """
        payload: Dict[str, Any] = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "tracker_id": self.tracker_id,
            "url": url,
        }

        if referrer:
            payload["referrer"] = referrer
        if user_agent:
            payload["user_agent"] = user_agent
        if ip:
            payload["ip"] = self._anonymize_ip(ip) if self.anonymize_ip else ip
        if meta:
            payload["meta"] = meta

        return self._send(payload)

    def track_page_view(
        self,
        url: str,
        referrer: Optional[str] = None,
        user_agent: Optional[str] = None,
        ip: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Convenience wrapper for page_view events."""
        return self.track("page_view", url, referrer, user_agent, ip, meta)

    # -----------------------------------------------------------------
    # HTTP transport
    # -----------------------------------------------------------------

    def _send(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send a signed payload to the API."""
        canonical = canonicalize(payload)
        sig = signature_header(canonical, self.api_secret)
        timestamp = payload.get("timestamp", "")

        headers = {
            "Content-Type": "application/json",
            "X-Tracker-Id": self.tracker_id,
            "X-Signature": sig,
            "X-Timestamp": timestamp,
            "User-Agent": f"AilabsAudit-Python/{__import__('ailabsaudit_tracker').__version__}",
        }

        body_bytes = canonical.encode("utf-8")
        req = Request(self.api_url, data=body_bytes, headers=headers, method="POST")

        try:
            resp = urlopen(req, timeout=self.timeout)
            status_code = resp.getcode()
            body = resp.read().decode("utf-8", errors="replace")
            return {
                "success": 200 <= status_code < 300,
                "status_code": status_code,
                "body": body,
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

    # -----------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------

    @staticmethod
    def _anonymize_ip(ip: str) -> str:
        """Zero last octet of IPv4 address."""
        if re.match(r"^\d+\.\d+\.\d+\.\d+$", ip):
            return re.sub(r"\.\d+$", ".0", ip)
        return ip
