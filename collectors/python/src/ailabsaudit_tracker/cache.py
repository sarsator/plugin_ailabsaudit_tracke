"""
cache.py — List cache with API refresh, ETag support, and TTL.

Uses only the standard library (threading for async refresh).
"""

import json
import ssl
import threading
import time
from typing import List, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from .defaults import BOT_SIGNATURES, AI_REFERRERS

CACHE_TTL = 86400  # 24 hours in seconds.


class ListCache:
    """Caches bot signatures and AI referrer lists with periodic API refresh.

    Falls back to hardcoded defaults when the API is unavailable.
    """

    def __init__(self, api_url: str, api_key: str, api_secret: str, sign_fn):
        self._api_url = api_url.rstrip("/")
        self._api_key = api_key
        self._api_secret = api_secret
        self._sign = sign_fn

        self._bot_signatures: List[str] = list(BOT_SIGNATURES)
        self._ai_referrers: List[str] = list(AI_REFERRERS)
        self._bot_etag = ""
        self._referrer_etag = ""
        self._bot_expires_at = 0.0
        self._referrer_expires_at = 0.0
        self._lock = threading.Lock()
        self._timer: Optional[threading.Timer] = None
        self._stopped = False

    def get_bot_signatures(self) -> List[str]:
        if time.time() > self._bot_expires_at:
            self._schedule_refresh()
        with self._lock:
            return list(self._bot_signatures)

    def get_ai_referrers(self) -> List[str]:
        if time.time() > self._referrer_expires_at:
            self._schedule_refresh()
        with self._lock:
            return list(self._ai_referrers)

    def start(self):
        """Start initial refresh in a background thread."""
        self._stopped = False
        t = threading.Thread(target=self._do_refresh, daemon=True)
        t.start()
        self._schedule_timer()

    def stop(self):
        """Stop periodic refresh."""
        self._stopped = True
        if self._timer:
            self._timer.cancel()
            self._timer = None

    def _schedule_timer(self):
        if self._stopped:
            return
        self._timer = threading.Timer(CACHE_TTL, self._timer_tick)
        self._timer.daemon = True
        self._timer.start()

    def _timer_tick(self):
        if self._stopped:
            return
        self._do_refresh()
        self._schedule_timer()

    def _schedule_refresh(self):
        t = threading.Thread(target=self._do_refresh, daemon=True)
        t.start()

    def _do_refresh(self):
        self._refresh_bot_signatures()
        self._refresh_ai_referrers()

    def _refresh_bot_signatures(self):
        path = "/api/v1/bot-signatures"
        data, etag = self._fetch_list(path, self._bot_etag)
        if data is None:
            # 304 or error — just extend TTL.
            self._bot_expires_at = time.time() + CACHE_TTL
            return
        sigs = data.get("signatures", [])
        if isinstance(sigs, list):
            patterns = [
                s["pattern"] for s in sigs
                if isinstance(s, dict) and isinstance(s.get("pattern"), str)
                and 0 < len(s["pattern"]) < 256
            ]
            if patterns:
                with self._lock:
                    self._bot_signatures = patterns
                    self._bot_etag = etag
        self._bot_expires_at = time.time() + CACHE_TTL

    def _refresh_ai_referrers(self):
        path = "/api/v1/ai-referrers"
        data, etag = self._fetch_list(path, self._referrer_etag)
        if data is None:
            self._referrer_expires_at = time.time() + CACHE_TTL
            return
        refs = data.get("referrers", [])
        if isinstance(refs, list):
            domains = [
                r["domain"] for r in refs
                if isinstance(r, dict) and isinstance(r.get("domain"), str)
                and 0 < len(r["domain"]) < 256
            ]
            if domains:
                with self._lock:
                    self._ai_referrers = domains
                    self._referrer_etag = etag
        self._referrer_expires_at = time.time() + CACHE_TTL

    def _fetch_list(self, path: str, etag: str):
        """Fetch a list from the API with signed request and ETag.

        Returns (parsed_data, new_etag) on 200, or (None, '') on 304/error.
        """
        timestamp = str(int(time.time()))
        signature = self._sign(timestamp, "GET", path, "", self._api_secret)

        url_path = path.replace("/api/v1", "")
        url = self._api_url + url_path

        headers = {
            "X-API-Key": self._api_key,
            "X-Timestamp": timestamp,
            "X-Signature": signature,
            "User-Agent": "AilabsauditTracker/1.0.0 Python",
        }
        if etag:
            headers["If-None-Match"] = etag

        req = Request(url, headers=headers, method="GET")
        ssl_ctx = ssl.create_default_context()

        try:
            resp = urlopen(req, timeout=15, context=ssl_ctx)
            if resp.getcode() == 200:
                body = resp.read().decode("utf-8", errors="replace")
                data = json.loads(body)
                new_etag = resp.headers.get("ETag", "")
                return data, new_etag
        except HTTPError as exc:
            if exc.code == 304:
                return None, ""
        except (URLError, OSError, json.JSONDecodeError):
            pass

        return None, ""
