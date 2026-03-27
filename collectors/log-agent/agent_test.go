package main

import (
	"testing"
)

// -----------------------------------------------------------------
// Log parsing
// -----------------------------------------------------------------

func TestParseNginxCombined(t *testing.T) {
	line := `93.184.216.34 - - [10/Mar/2026:14:22:01 +0000] "GET /page HTTP/1.1" 200 5123 "https://chatgpt.com/c/abc" "Mozilla/5.0 (compatible; GPTBot/1.0)"`
	e := parseLogLine(line)
	if e == nil {
		t.Fatal("expected non-nil")
	}
	assertEqual(t, "URL", e.URL, "/page")
	assertEqual(t, "StatusCode", itoa(e.StatusCode), "200")
	assertEqual(t, "ResponseSize", itoa(e.ResponseSize), "5123")
	assertEqual(t, "UserAgent", e.UserAgent, "Mozilla/5.0 (compatible; GPTBot/1.0)")
	assertEqual(t, "Referer", e.Referer, "https://chatgpt.com/c/abc")
}

func TestParseApacheCommon(t *testing.T) {
	line := `10.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /robots.txt HTTP/1.0" 200 2326 "-" "ClaudeBot/1.0"`
	e := parseLogLine(line)
	if e == nil {
		t.Fatal("expected non-nil")
	}
	assertEqual(t, "URL", e.URL, "/robots.txt")
	assertEqual(t, "UserAgent", e.UserAgent, "ClaudeBot/1.0")
}

func TestParseLlmsTxt(t *testing.T) {
	line := `10.0.0.1 - - [10/Mar/2026:14:22:01 +0000] "GET /llms.txt HTTP/1.1" 200 1234 "-" "GPTBot/1.0"`
	e := parseLogLine(line)
	if e == nil {
		t.Fatal("expected non-nil")
	}
	assertEqual(t, "URL", e.URL, "/llms.txt")
}

func TestParseLlmsFullTxt(t *testing.T) {
	line := `10.0.0.1 - - [10/Mar/2026:14:22:01 +0000] "GET /llms-full.txt HTTP/1.1" 200 9999 "-" "GPTBot/1.0"`
	e := parseLogLine(line)
	if e == nil {
		t.Fatal("expected non-nil")
	}
	assertEqual(t, "URL", e.URL, "/llms-full.txt")
}

func TestParseDashSize(t *testing.T) {
	line := `10.0.0.1 - - [10/Mar/2026:00:00:00 +0000] "HEAD / HTTP/1.1" 304 - "-" "PerplexityBot/1.0"`
	e := parseLogLine(line)
	if e == nil {
		t.Fatal("expected non-nil")
	}
	assertEqual(t, "ResponseSize", itoa(e.ResponseSize), "0")
	assertEqual(t, "StatusCode", itoa(e.StatusCode), "304")
}

func TestParseInvalidLine(t *testing.T) {
	if parseLogLine("this is not a log line") != nil {
		t.Error("expected nil for invalid line")
	}
}

func TestParseEmptyLine(t *testing.T) {
	if parseLogLine("") != nil {
		t.Error("expected nil for empty line")
	}
}

// -----------------------------------------------------------------
// Bot matching
// -----------------------------------------------------------------

func TestMatchBotGPTBot(t *testing.T) {
	assertEqual(t, "GPTBot", matchBot("Mozilla/5.0 (compatible; GPTBot/1.0)", botSignatures), "GPTBot")
}

func TestMatchBotClaudeBot(t *testing.T) {
	assertEqual(t, "ClaudeBot", matchBot("ClaudeBot/1.0", botSignatures), "ClaudeBot")
}

func TestMatchBotCaseInsensitive(t *testing.T) {
	assertEqual(t, "case", matchBot("gptbot/1.0", botSignatures), "GPTBot")
}

func TestMatchBotDeepSeek(t *testing.T) {
	assertEqual(t, "DeepSeekBot", matchBot("DeepSeekBot/1.0", botSignatures), "DeepSeekBot")
}

func TestMatchBotNoMatchChrome(t *testing.T) {
	assertEqual(t, "chrome", matchBot("Mozilla/5.0 Chrome/120.0", botSignatures), "")
}

func TestMatchBotEmpty(t *testing.T) {
	assertEqual(t, "empty", matchBot("", botSignatures), "")
}

func TestMatchBotCurl(t *testing.T) {
	assertEqual(t, "curl", matchBot("curl/8.4.0", botSignatures), "")
}

// -----------------------------------------------------------------
// Referrer matching
// -----------------------------------------------------------------

func TestMatchReferrerChatGPT(t *testing.T) {
	assertEqual(t, "chatgpt", matchReferrer("https://chatgpt.com/c/abc", aiReferrers), "chatgpt.com")
}

func TestMatchReferrerClaude(t *testing.T) {
	assertEqual(t, "claude", matchReferrer("https://claude.ai/chat/123", aiReferrers), "claude.ai")
}

func TestMatchReferrerSubdomain(t *testing.T) {
	r := matchReferrer("https://labs.perplexity.ai/search", aiReferrers)
	if r == "" {
		t.Error("expected match for perplexity subdomain")
	}
}

func TestMatchReferrerEqPerplexity(t *testing.T) {
	r := matchReferrer("https://eq.perplexity.ai/page", aiReferrers)
	if r == "" {
		t.Error("expected match for eq.perplexity.ai")
	}
}

func TestMatchReferrerNoMatch(t *testing.T) {
	assertEqual(t, "google", matchReferrer("https://google.com/search", aiReferrers), "")
}

func TestMatchReferrerEmpty(t *testing.T) {
	assertEqual(t, "empty", matchReferrer("", aiReferrers), "")
}

func TestMatchReferrerDash(t *testing.T) {
	assertEqual(t, "dash", matchReferrer("-", aiReferrers), "")
}

// -----------------------------------------------------------------
// Event detection
// -----------------------------------------------------------------

func TestDetectBotCrawl(t *testing.T) {
	initTestCache()
	e := detectEvent(&logEntry{
		UserAgent:    "Mozilla/5.0 (compatible; GPTBot/1.0)",
		URL:          "/page",
		StatusCode:   200,
		ResponseSize: 5000,
		Referer:      "",
	})
	if e == nil {
		t.Fatal("expected event")
	}
	assertEqual(t, "type", e.Type, "bot_crawl")
	assertEqual(t, "url", e.URL, "/page")
}

func TestDetectAiReferral(t *testing.T) {
	initTestCache()
	e := detectEvent(&logEntry{
		UserAgent:    "Mozilla/5.0 Chrome/120.0",
		URL:          "/landing",
		StatusCode:   200,
		ResponseSize: 3000,
		Referer:      "https://chatgpt.com/c/abc",
	})
	if e == nil {
		t.Fatal("expected event")
	}
	assertEqual(t, "type", e.Type, "ai_referral")
	assertEqual(t, "domain", e.ReferrerDomain, "chatgpt.com")
}

func TestDetectRobotsTxt(t *testing.T) {
	initTestCache()
	e := detectEvent(&logEntry{
		UserAgent: "ClaudeBot/1.0",
		URL:       "/robots.txt",
		StatusCode: 200,
		Referer:   "",
	})
	if e == nil {
		t.Fatal("expected event")
	}
	assertEqual(t, "type", e.Type, "bot_crawl")
	assertEqual(t, "url", e.URL, "/robots.txt")
}

func TestDetectLlmsFullTxt(t *testing.T) {
	initTestCache()
	e := detectEvent(&logEntry{
		UserAgent: "GPTBot/1.0",
		URL:       "/llms-full.txt",
		StatusCode: 200,
		Referer:   "",
	})
	if e == nil {
		t.Fatal("expected event")
	}
	assertEqual(t, "url", e.URL, "/llms-full.txt")
}

func TestDetectNoMatch(t *testing.T) {
	initTestCache()
	e := detectEvent(&logEntry{
		UserAgent: "Mozilla/5.0 Chrome/120.0",
		URL:       "/page",
		StatusCode: 200,
		Referer:   "https://google.com/",
	})
	if e != nil {
		t.Error("expected nil for normal traffic")
	}
}

// -----------------------------------------------------------------
// Buffer
// -----------------------------------------------------------------

func TestBufferAdd(t *testing.T) {
	buf := newTestBuffer()
	buf.add(&event{Type: "bot_crawl", URL: "/test"})
	assertEqual(t, "size", itoa(buf.size()), "1")
}

func TestBufferCap(t *testing.T) {
	buf := newTestBuffer()
	for i := 0; i < 600; i++ {
		buf.add(&event{Type: "bot_crawl", URL: "/p"})
	}
	if buf.size() > 500 {
		t.Errorf("buffer exceeded max: %d", buf.size())
	}
}

func TestBufferFlush(t *testing.T) {
	var sent int
	buf := newEventBuffer(500, 5*60*1e9, 0, func(events []*event) sendResult {
		sent = len(events)
		return sendResult{Success: true, StatusCode: 202}
	})
	buf.add(&event{Type: "bot_crawl", URL: "/f"})
	buf.doFlush()
	assertEqual(t, "sent", itoa(sent), "1")
	assertEqual(t, "empty", itoa(buf.size()), "0")
}

func TestBufferStop(t *testing.T) {
	var sent int
	buf := newEventBuffer(500, 5*60*1e9, 0, func(events []*event) sendResult {
		sent = len(events)
		return sendResult{Success: true, StatusCode: 202}
	})
	buf.add(&event{Type: "bot_crawl", URL: "/stop"})
	buf.stop()
	assertEqual(t, "sent", itoa(sent), "1")
}

// -----------------------------------------------------------------
// HMAC signing
// -----------------------------------------------------------------

func TestHmacSignFormat(t *testing.T) {
	sig := hmacSign("1234567890", "POST", "/api/v1/tracking/events", `{"test":true}`, "secret123")
	if len(sig) != 64 {
		t.Errorf("expected 64 chars, got %d", len(sig))
	}
}

func TestHmacSignDeterministic(t *testing.T) {
	sig1 := hmacSign("1000", "GET", "/path", "", "key")
	sig2 := hmacSign("1000", "GET", "/path", "", "key")
	assertEqual(t, "deterministic", sig1, sig2)
}

func TestHmacSignDiffers(t *testing.T) {
	sig1 := hmacSign("1000", "GET", "/path", "", "key")
	sig2 := hmacSign("1001", "GET", "/path", "", "key")
	if sig1 == sig2 {
		t.Error("expected different signatures")
	}
}

// -----------------------------------------------------------------
// UUID
// -----------------------------------------------------------------

func TestUUID4Format(t *testing.T) {
	id := uuid4()
	if len(id) != 36 {
		t.Errorf("expected 36 chars, got %d: %s", len(id), id)
	}
	if id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		t.Errorf("bad UUID format: %s", id)
	}
}

// -----------------------------------------------------------------
// False positives
// -----------------------------------------------------------------

func TestFalsePositiveBots(t *testing.T) {
	normalUAs := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) Safari/605.1.15",
		"Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Safari/604.1",
		"Wget/1.21",
		"PostmanRuntime/7.36.0",
		"python-requests/2.31.0",
		"curl/8.4.0",
	}
	for _, ua := range normalUAs {
		if m := matchBot(ua, botSignatures); m != "" {
			t.Errorf("false positive bot for %q: matched %q", ua[:40], m)
		}
	}
}

func TestFalsePositiveReferrers(t *testing.T) {
	normalRefs := []string{
		"https://google.com/search",
		"https://www.google.com/",
		"https://facebook.com/share",
		"https://twitter.com/intent",
		"https://t.co/abc",
		"https://reddit.com/r/golang",
		"https://youtube.com/watch",
	}
	for _, ref := range normalRefs {
		if m := matchReferrer(ref, aiReferrers); m != "" {
			t.Errorf("false positive referrer for %q: matched %q", ref, m)
		}
	}
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

func initTestCache() {
	listCache = &signatureListCache{
		bots: botSignatures,
		refs: aiReferrers,
	}
}

func newTestBuffer() *eventBuffer {
	return newEventBuffer(500, 5*60*1e9, 30*1e9, func(events []*event) sendResult {
		return sendResult{Success: true, StatusCode: 202}
	})
}

func assertEqual(t *testing.T, name, got, want string) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %q, want %q", name, got, want)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	if neg {
		s = "-" + s
	}
	return s
}
