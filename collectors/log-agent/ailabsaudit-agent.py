#!/usr/bin/env python3
"""
ailabsaudit-agent — Lightweight log-tail agent for AI bot detection.

Reads web server access logs in real-time, detects AI bot crawls and
AI referral traffic, buffers events, and sends signed batches to the
AI Labs Audit ingestion API.

Zero external dependencies — Python 3.6+ stdlib only.

HMAC format: "{timestamp}\\n{method}\\n{path}\\n{body}"
"""

import hashlib
import hmac as hmac_mod
import json
import os
import re
import signal
import ssl
import subprocess
import sys
import threading
import time
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

VERSION = "1.0.0"

# -----------------------------------------------------------------
# Default bot signatures and AI referrer domains
# Source of truth: spec/default-lists.json
# -----------------------------------------------------------------

BOT_SIGNATURES = [
    "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ChatGPT-Browser", "Operator",
    "ClaudeBot", "Claude-Web", "Claude-SearchBot", "Claude-User", "Anthropic-Claude", "anthropic-ai",
    "Google-Extended", "GoogleOther", "GoogleOther-Image", "GoogleOther-Video",
    "Google-CloudVertexBot", "GoogleAgent-Mariner", "Gemini-Deep-Research", "Google-NotebookLM", "Googlebot",
    "PerplexityBot", "Perplexity-User",
    "meta-externalagent", "meta-externalfetcher", "Meta-WebIndexer", "FacebookBot", "facebookexternalhit",
    "bingbot", "CopilotBot", "MicrosoftPreview", "AzureAI-SearchBot",
    "Applebot", "Applebot-Extended",
    "Bytespider", "ByteDance", "TikTokSpider",
    "GrokBot", "xAI-Grok", "Grok-DeepSearch",
    "Amazonbot", "Amzn-SearchBot", "Amzn-User", "NovaAct",
    "DuckAssistBot", "CCBot", "Diffbot", "Seekr", "Spider",
    "cohere-ai", "cohere-training-data-crawler", "YouBot", "MistralAI-User",
    "PetalBot", "PanguBot", "ChatGLM-Spider", "Timpibot", "ImagesiftBot",
    "AI2Bot", "Ai2Bot-Dolma", "Andibot", "Bravebot", "PhindBot",
    "LinerBot", "TavilyBot", "Kangaroo Bot", "LinkedInBot",
    "Manus-User", "kagi-fetcher", "Cloudflare-AutoRAG", "VelenPublicWebCrawler",
    "omgili", "Webzio", "webzio-extended", "Nicecrawler", "ICC-Crawler",
    "Scrapy", "newspaper", "AhrefsBot", "SemrushBot", "MJ12bot",
    "DotBot", "Rogerbot", "Screaming Frog", "ISSCyberRiskCrawler",
    "Sidetrade", "Owler", "DeepSeekBot", "Mistral", "Firecrawl", "Jina",
]

AI_REFERRERS = [
    "chatgpt.com", "chat.openai.com",
    "perplexity.ai", "labs.perplexity.ai",
    "claude.ai",
    "gemini.google.com", "labs.google", "aistudio.google.com", "notebooklm.google.com",
    "copilot.microsoft.com", "copilot.cloud.microsoft",
    "poe.com", "you.com", "phind.com",
    "deepseek.com", "chat.deepseek.com",
    "grok.x.ai", "meta.ai", "chat.mistral.ai",
    "kagi.com", "andi.com", "iask.ai",
    "brave.com", "search.brave.com",
    "character.ai", "huggingface.co", "huggingchat.co",
    "grok.com", "getliner.com", "liner.com",
]

# -----------------------------------------------------------------
# HMAC signing
# -----------------------------------------------------------------

def sign(timestamp, method, path, body, secret):
    string_to_sign = f"{timestamp}\n{method}\n{path}\n{body}"
    return hmac_mod.new(
        secret.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

# -----------------------------------------------------------------
# Log parsing
# -----------------------------------------------------------------

# Combined/Common log format (Nginx & Apache default)
# 127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET /page HTTP/1.1" 200 2326 "http://referer.com" "Mozilla/5.0 ..."
LOG_PATTERN = re.compile(
    r'^(\S+)\s+'           # IP
    r'\S+\s+'              # ident
    r'\S+\s+'              # user
    r'\[([^\]]+)\]\s+'     # timestamp
    r'"(\S+)\s+'           # method
    r'(\S+)\s+'            # url
    r'[^"]*"\s+'           # protocol
    r'(\d{3})\s+'          # status code
    r'(\S+)'               # response size
    r'(?:\s+"([^"]*)"\s+'  # referer (optional)
    r'"([^"]*)")?'         # user-agent (optional)
)

def parse_log_line(line):
    """Parse a combined/common log format line.

    Returns dict with keys: ip, url, status_code, response_size, referer, user_agent
    or None if the line doesn't match.
    """
    m = LOG_PATTERN.match(line)
    if not m:
        return None
    return {
        "ip": m.group(1),
        "timestamp": m.group(2),
        "method": m.group(3),
        "url": m.group(4),
        "status_code": int(m.group(5)),
        "response_size": int(m.group(6)) if m.group(6) != "-" else 0,
        "referer": m.group(7) or "",
        "user_agent": m.group(8) or "",
    }

# -----------------------------------------------------------------
# Detection
# -----------------------------------------------------------------

def match_bot(user_agent, bot_signatures):
    if not user_agent:
        return None
    ua_lower = user_agent.lower()
    for pattern in bot_signatures:
        if pattern.lower() in ua_lower:
            return pattern
    return None

def match_referrer(referer, ai_referrers):
    if not referer:
        return None
    try:
        # Extract hostname from referer URL.
        host = referer.split("//")[-1].split("/")[0].split(":")[0].lower()
    except (IndexError, ValueError):
        return None
    if not host:
        return None
    for domain in ai_referrers:
        domain_lower = domain.lower()
        if host == domain_lower or host.endswith("." + domain_lower):
            return domain
    return None

def detect_event(parsed, bot_signatures, ai_referrers):
    """Detect a bot crawl or AI referral from a parsed log line.

    Returns event dict or None.
    """
    ua = parsed["user_agent"]
    matched_bot = match_bot(ua, bot_signatures)
    if matched_bot:
        return {
            "type": "bot_crawl",
            "user_agent": ua[:500],
            "url": parsed["url"][:2000],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "status_code": parsed["status_code"],
            "response_size": parsed["response_size"],
        }

    matched_domain = match_referrer(parsed["referer"], ai_referrers)
    if matched_domain:
        return {
            "type": "ai_referral",
            "referrer_domain": matched_domain,
            "url": parsed["url"][:2000],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    return None

# -----------------------------------------------------------------
# Event buffer
# -----------------------------------------------------------------

MAX_BUFFER_SIZE = 500
FLUSH_INTERVAL = 300   # 5 minutes.
FLUSH_DEBOUNCE = 30    # 30 seconds.
MAX_RETRIES = 3

class EventBuffer:
    def __init__(self, send_fn):
        self._send = send_fn
        self._events = []
        self._lock = threading.Lock()
        self._timer = None
        self._last_flush = 0.0
        self._retry_count = 0
        self._stopped = False

    def add(self, event):
        should_flush = False
        with self._lock:
            self._events.append(event)
            if len(self._events) > MAX_BUFFER_SIZE:
                self._events = self._events[-MAX_BUFFER_SIZE:]
            if len(self._events) >= MAX_BUFFER_SIZE:
                should_flush = True
        if should_flush:
            self.flush()

    def start(self):
        self._stopped = False
        self._schedule()

    def stop(self):
        self._stopped = True
        if self._timer:
            self._timer.cancel()
        self._do_flush()

    def flush(self):
        now = time.time()
        if now - self._last_flush < FLUSH_DEBOUNCE:
            return
        self._do_flush()

    def _do_flush(self):
        with self._lock:
            if not self._events:
                return
            events = list(self._events)
            self._events.clear()

        self._last_flush = time.time()
        try:
            result = self._send(events)
            if result.get("success"):
                self._retry_count = 0
                return
            status = result.get("status_code", 0)
            if status in (401, 403):
                return
            self._re_store(events)
        except Exception:
            self._re_store(events)

    def _re_store(self, events):
        if self._retry_count >= MAX_RETRIES:
            self._retry_count = 0
            return
        self._retry_count += 1
        with self._lock:
            self._events = events + self._events
            self._events = self._events[:MAX_BUFFER_SIZE]

    def _schedule(self):
        if self._stopped:
            return
        self._timer = threading.Timer(FLUSH_INTERVAL, self._tick)
        self._timer.daemon = True
        self._timer.start()

    def _tick(self):
        if self._stopped:
            return
        self.flush()
        self._schedule()

    @property
    def size(self):
        with self._lock:
            return len(self._events)

# -----------------------------------------------------------------
# API sender
# -----------------------------------------------------------------

def send_events(events, config):
    """Send a signed batch of events to the API.

    Returns dict with keys: success, status_code, body.
    """
    payload = json.dumps({
        "client_id": config["client_id"],
        "plugin_type": "log-agent",
        "plugin_version": VERSION,
        "batch_id": str(uuid.uuid4()),
        "events": events,
    }, separators=(",", ":"), ensure_ascii=False)

    path = "/api/v1/tracking/events"
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    sig = sign(timestamp, "POST", path, payload, config["api_secret"])

    headers = {
        "Content-Type": "application/json",
        "X-API-Key": config["api_key"],
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": sig,
        "User-Agent": f"AilabsauditTracker/{VERSION} LogAgent",
    }

    url = config["api_url"].rstrip("/") + "/tracking/events"
    body_bytes = payload.encode("utf-8")
    req = Request(url, data=body_bytes, headers=headers, method="POST")
    ssl_ctx = ssl.create_default_context()

    try:
        resp = urlopen(req, timeout=15, context=ssl_ctx)
        status_code = resp.getcode()
        resp_body = resp.read().decode("utf-8", errors="replace")
        return {"success": 200 <= status_code < 300, "status_code": status_code, "body": resp_body}
    except HTTPError as exc:
        return {"success": False, "status_code": exc.code, "body": exc.read().decode("utf-8", errors="replace")}
    except (URLError, OSError) as exc:
        return {"success": False, "status_code": 0, "body": str(exc)}

# -----------------------------------------------------------------
# Log file tailing
# -----------------------------------------------------------------

def tail_file(filepath, callback, stop_event):
    """Tail a file like `tail -F`, following rotations.

    Calls callback(line) for each new line.
    """
    while not stop_event.is_set():
        try:
            with open(filepath, "r") as f:
                # Seek to end.
                f.seek(0, 2)
                while not stop_event.is_set():
                    line = f.readline()
                    if line:
                        callback(line.rstrip("\n"))
                    else:
                        # Check if file was rotated (inode changed).
                        try:
                            if os.stat(filepath).st_ino != os.fstat(f.fileno()).st_ino:
                                break  # File rotated, reopen.
                        except OSError:
                            break
                        stop_event.wait(0.2)
        except FileNotFoundError:
            log(f"Waiting for log file: {filepath}")
            stop_event.wait(5)
        except PermissionError:
            log(f"Permission denied: {filepath}")
            stop_event.wait(10)

# -----------------------------------------------------------------
# Log path auto-detection
# -----------------------------------------------------------------

COMMON_LOG_PATHS = [
    # Nginx.
    "/var/log/nginx/access.log",
    "/var/log/nginx/access_log",
    "/usr/local/nginx/logs/access.log",
    # Apache.
    "/var/log/apache2/access.log",
    "/var/log/apache2/access_log",
    "/var/log/httpd/access_log",
    "/var/log/httpd/access.log",
    # LiteSpeed.
    "/usr/local/lsws/logs/access.log",
    "/var/log/litespeed/access.log",
    # Caddy.
    "/var/log/caddy/access.log",
]

def detect_log_path():
    """Auto-detect the web server access log path."""
    for path in COMMON_LOG_PATHS:
        if os.path.isfile(path):
            return path
    return None

def detect_web_server():
    """Detect which web server is running."""
    servers = ["nginx", "apache2", "httpd", "lsws", "caddy"]
    for name in servers:
        try:
            result = subprocess.run(
                ["pgrep", "-x", name], capture_output=True, timeout=5
            )
            if result.returncode == 0:
                return name
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return None

# -----------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------

CONFIG_PATH = "/etc/ailabsaudit/agent.conf"

def load_config(path=None):
    """Load configuration from JSON file."""
    cfg_path = path or CONFIG_PATH
    if not os.path.isfile(cfg_path):
        print(f"Error: config file not found: {cfg_path}", file=sys.stderr)
        sys.exit(1)

    with open(cfg_path, "r") as f:
        config = json.load(f)

    required = ["api_key", "api_secret", "client_id", "api_url"]
    for key in required:
        if not config.get(key):
            print(f"Error: missing '{key}' in {cfg_path}", file=sys.stderr)
            sys.exit(1)

    if not config.get("log_path"):
        detected = detect_log_path()
        if detected:
            config["log_path"] = detected
            log(f"Auto-detected log path: {detected}")
        else:
            print("Error: no log_path configured and auto-detection failed.", file=sys.stderr)
            print("Set 'log_path' in " + cfg_path, file=sys.stderr)
            sys.exit(1)

    return config

# -----------------------------------------------------------------
# Logging
# -----------------------------------------------------------------

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    print(f"[{ts}] ailabsaudit-agent: {msg}", flush=True)

# -----------------------------------------------------------------
# Main
# -----------------------------------------------------------------

def main():
    config_path = None
    if len(sys.argv) > 2 and sys.argv[1] == "--config":
        config_path = sys.argv[2]

    config = load_config(config_path)
    log_path = config["log_path"]

    log(f"Starting ailabsaudit-agent v{VERSION}")
    log(f"Tailing: {log_path}")
    log(f"API: {config['api_url']}")
    log(f"Bot signatures: {len(BOT_SIGNATURES)}, AI referrers: {len(AI_REFERRERS)}")

    buffer = EventBuffer(
        send_fn=lambda events: send_events(events, config)
    )
    buffer.start()

    stop_event = threading.Event()
    stats = {"lines": 0, "matched": 0}

    def on_line(line):
        stats["lines"] += 1
        parsed = parse_log_line(line)
        if not parsed:
            return
        event = detect_event(parsed, BOT_SIGNATURES, AI_REFERRERS)
        if event:
            stats["matched"] += 1
            buffer.add(event)

    def on_signal(signum, frame):
        log(f"Received signal {signum}, shutting down...")
        stop_event.set()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    # Stats reporter.
    def report_stats():
        while not stop_event.is_set():
            stop_event.wait(300)
            if not stop_event.is_set():
                log(f"Stats: {stats['lines']} lines parsed, {stats['matched']} events matched, {buffer.size} buffered")

    stats_thread = threading.Thread(target=report_stats, daemon=True)
    stats_thread.start()

    try:
        tail_file(log_path, on_line, stop_event)
    except Exception as e:
        log(f"Fatal error: {e}")
    finally:
        log("Flushing remaining events...")
        buffer.stop()
        log(f"Final stats: {stats['lines']} lines, {stats['matched']} events")
        log("Agent stopped.")

if __name__ == "__main__":
    main()
