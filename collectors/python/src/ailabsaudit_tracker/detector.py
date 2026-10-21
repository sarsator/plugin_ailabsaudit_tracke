"""
detector.py — Bot and referrer detection with WSGI middleware.
"""

from typing import Callable, Dict, List, Optional, Any
from datetime import datetime, timezone
from urllib.parse import urlparse

try:
    from .page_profile import extract_page_profile
except Exception:  # pragma: no cover - fallback import path
    try:
        from ailabsaudit_tracker.page_profile import extract_page_profile
    except Exception:
        extract_page_profile = None


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


def _profile_from_environ(environ: Dict) -> Optional[Dict]:
    """Profil de page si la réponse HTML est déjà disponible (tests, ASGI shim)."""
    body = environ.get("ailabsaudit.response_body")
    if body and extract_page_profile:
        try:
            return extract_page_profile(body)
        except Exception:
            return None
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
        referer = environ.get("HTTP_REFERER", "")

        matched_bot = None
        bot_sigs = None
        if ua:
            bot_sigs = self._tracker._cache.get_bot_signatures() if self._tracker._cache else self._tracker._defaults_bot
            ai_refs = self._tracker._cache.get_ai_referrers() if self._tracker._cache else self._tracker._defaults_ref
            matched_bot = match_bot(ua, bot_sigs)

        if not matched_bot:
            if ua and referer:
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

        # Bot IA : on intercepte la réponse pour status, taille et profil de page.
        captured: Dict[str, Any] = {
            "chunks": [],
            "size": 0,
            "status": 200,
            "content_type": "",
        }
        cap_limit = 256 * 1024

        def _tracking_start_response(status_line, headers, exc_info=None):
            try:
                captured["status"] = int(str(status_line).split(" ", 1)[0])
            except Exception:
                captured["status"] = 200
            for k, v in headers or []:
                if str(k).lower() == "content-type":
                    captured["content_type"] = str(v)
                    break
            return start_response(status_line, headers, exc_info)

        result = self._app(environ, _tracking_start_response)

        def _iter_and_flush():
            try:
                for chunk in result:
                    if isinstance(chunk, (bytes, bytearray)):
                        blen = len(chunk)
                    else:
                        chunk = str(chunk).encode("utf-8", "replace")
                        blen = len(chunk)
                    captured["size"] += blen
                    if captured["size"] <= cap_limit:
                        captured["chunks"].append(chunk)
                    yield chunk
            finally:
                try:
                    if hasattr(result, "close"):
                        result.close()
                except Exception:
                    pass
                self._emit_bot_event(ua, url, referer, captured)

        return _iter_and_flush()

    def _emit_bot_event(self, ua: str, url: str, referer: str, captured: Dict) -> None:
        event = {
            "type": "bot_crawl",
            "user_agent": ua[:500],
            "url": url[:2000],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status_code": captured.get("status") or 200,
            "response_size": captured.get("size") or 0,
        }
        if referer:
            event["referer"] = referer[:2000]
        body = b"".join(captured.get("chunks") or [])
        ctype = (captured.get("content_type") or "").lower()
        if body and (not ctype or "html" in ctype or "xml" in ctype) and extract_page_profile:
            try:
                profile = extract_page_profile(body)
                if profile:
                    event["page_profile"] = profile
            except Exception:
                pass
        try:
            self._tracker._buffer.add(event)
        except Exception:
            pass
