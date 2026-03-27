package main

import (
	"strings"
	"time"
)

// matchBot checks user-agent against bot signatures (case-insensitive).
// Returns the matched pattern or empty string.
func matchBot(userAgent string, signatures []string) string {
	if userAgent == "" {
		return ""
	}
	uaLower := strings.ToLower(userAgent)
	for _, sig := range signatures {
		if strings.Contains(uaLower, strings.ToLower(sig)) {
			return sig
		}
	}
	return ""
}

// matchReferrer checks a referer URL against AI referrer domains.
// Returns the matched domain or empty string.
func matchReferrer(referer string, referrers []string) string {
	if referer == "" || referer == "-" {
		return ""
	}

	// Extract hostname from referer URL without net/url (avoid alloc).
	host := referer
	if idx := strings.Index(host, "://"); idx >= 0 {
		host = host[idx+3:]
	}
	if idx := strings.IndexByte(host, '/'); idx >= 0 {
		host = host[:idx]
	}
	if idx := strings.IndexByte(host, ':'); idx >= 0 {
		host = host[:idx]
	}
	host = strings.ToLower(host)

	if host == "" {
		return ""
	}

	for _, domain := range referrers {
		d := strings.ToLower(domain)
		if host == d || strings.HasSuffix(host, "."+d) {
			return domain
		}
	}
	return ""
}

// event represents a detected tracking event.
type event struct {
	Type           string `json:"type"`
	UserAgent      string `json:"user_agent,omitempty"`
	URL            string `json:"url"`
	Timestamp      string `json:"timestamp"`
	StatusCode     int    `json:"status_code,omitempty"`
	ResponseSize   int    `json:"response_size,omitempty"`
	ReferrerDomain string `json:"referrer_domain,omitempty"`
}

// detectEvent checks a parsed log entry against current lists.
// Returns nil if no match.
func detectEvent(entry *logEntry) *event {
	sigs, refs := listCache.get()

	now := time.Now().UTC().Format(time.RFC3339)

	// Truncate fields for safety.
	ua := entry.UserAgent
	if len(ua) > 500 {
		ua = ua[:500]
	}
	url := entry.URL
	if len(url) > 2000 {
		url = url[:2000]
	}

	if matched := matchBot(entry.UserAgent, sigs); matched != "" {
		return &event{
			Type:         "bot_crawl",
			UserAgent:    ua,
			URL:          url,
			Timestamp:    now,
			StatusCode:   entry.StatusCode,
			ResponseSize: entry.ResponseSize,
		}
	}

	if matched := matchReferrer(entry.Referer, refs); matched != "" {
		return &event{
			Type:           "ai_referral",
			ReferrerDomain: matched,
			URL:            url,
			Timestamp:      now,
		}
	}

	return nil
}
