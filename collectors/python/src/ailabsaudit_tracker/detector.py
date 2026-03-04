"""
detector.py — Bot and referrer detection with WSGI middleware.
"""

from typing import Callable, Dict, List, Optional, Any
from datetime import datetime, timezone
from urllib.parse import urlparse


def match_bot(user_agent: str, bot_signatures: List[str]) -> Optional[str]:
    """Match user-agent against bot signatures (case-insensitive).

    Returns matched pattern or None.
    """
    if not user_agent:
        return None
    ua_lower = user_agent.lower()
    for pattern in bot_signatures:
        if pattern.lower() in ua_lower:
            return pattern
    return None


def match_referrer(hostname: str, ai_referrers: List[str]) -> Optional[str]:
    """Match hostname against AI referrer domains (case-insensitive).

    Returns matched domain or None.
    """
    if not hostname:
        return None
    host_lower = hostname.lower()
    for domain in ai_referrers:
        domain_lower = domain.lower()
        if host_lower == domain_lower or host_lower.endswith("." + domain_lower):
            return domain
    return None


class WsgiMiddleware:
    """WSGI middleware that detects AI bot crawls and referral traffic.

    Usage::

        tracker = AilabsTracker(..., enable_detection=True)
        app = WsgiMiddleware(app, tracker)
    """

    def __init__(self, app: Callable, tracker: Any):
        self._app = app
        self._tracker = tracker

    def __call__(self, environ: Dict, start_response: Callable) -> Any:
        ua = environ.get("HTTP_USER_AGENT", "")
        url = environ.get("PATH_INFO", "/")
        query = environ.get("QUERY_STRING", "")
        if query:
            url = url + "?" + query

        if ua:
            bot_sigs = self._tracker._cache.get_bot_signatures() if self._tracker._cache else self._tracker._defaults_bot
            ai_refs = self._tracker._cache.get_ai_referrers() if self._tracker._cache else self._tracker._defaults_ref

            matched_bot = match_bot(ua, bot_sigs)
            if matched_bot:
                self._tracker._buffer.add({
                    "type": "bot_crawl",
                    "user_agent": ua[:500],
                    "url": url[:2000],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "status_code": 200,
                    "response_size": 0,
                })
            else:
                referer = environ.get("HTTP_REFERER", "")
                if referer:
                    try:
                        parsed = urlparse(referer)
                        hostname = parsed.hostname or ""
                        matched_domain = match_referrer(hostname, ai_refs)
                        if matched_domain:
                            self._tracker._buffer.add({
                                "type": "ai_referral",
                                "referrer_domain": matched_domain,
                                "url": url[:2000],
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                    except Exception:
                        pass

        return self._app(environ, start_response)
