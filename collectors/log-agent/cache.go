package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

const cacheTTL = 24 * time.Hour

// signatureListCache manages bot signatures and AI referrer lists.
// Refreshes from the API every 24h with ETag support.
// Falls back to hardcoded defaults if the API is unreachable.
type signatureListCache struct {
	mu       sync.RWMutex
	bots     []string
	refs     []string
	botEtag  string
	refEtag  string
	cfg      *config
	client   *http.Client
}

// Global cache instance — initialized in main.
var listCache *signatureListCache

func initListCache(cfg *config) {
	listCache = &signatureListCache{
		bots: botSignatures,
		refs: aiReferrers,
		cfg:  cfg,
		client: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					MinVersion: tls.VersionTLS12,
				},
				MaxIdleConns:    2,
				IdleConnTimeout: 60 * time.Second,
			},
		},
	}
}

// get returns the current bot signatures and AI referrers (thread-safe).
func (c *signatureListCache) get() ([]string, []string) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.bots, c.refs
}

// startRefresh starts the background refresh loop.
func (c *signatureListCache) startRefresh(ctx context.Context) {
	// Initial refresh.
	c.refresh()

	go func() {
		ticker := time.NewTicker(cacheTTL)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c.refresh()
			}
		}
	}()
}

func (c *signatureListCache) refresh() {
	c.refreshBotSignatures()
	c.refreshAiReferrers()
}

func (c *signatureListCache) refreshBotSignatures() {
	path := "/api/v1/bot-signatures"
	body, etag, err := c.fetchList(path, c.botEtag)
	if err != nil {
		log.Printf("Cache: bot signatures refresh failed: %v", err)
		return
	}
	if body == nil {
		// 304 Not Modified.
		return
	}

	var resp struct {
		Signatures []struct {
			Pattern string `json:"pattern"`
		} `json:"signatures"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		log.Printf("Cache: bot signatures parse error: %v", err)
		return
	}

	var patterns []string
	for _, s := range resp.Signatures {
		if len(s.Pattern) > 0 && len(s.Pattern) < 256 {
			patterns = append(patterns, s.Pattern)
		}
	}

	if len(patterns) > 0 {
		c.mu.Lock()
		c.bots = patterns
		c.botEtag = etag
		c.mu.Unlock()
		log.Printf("Cache: updated bot signatures (%d patterns)", len(patterns))
	}
}

func (c *signatureListCache) refreshAiReferrers() {
	path := "/api/v1/ai-referrers"
	body, etag, err := c.fetchList(path, c.refEtag)
	if err != nil {
		log.Printf("Cache: AI referrers refresh failed: %v", err)
		return
	}
	if body == nil {
		return
	}

	var resp struct {
		Referrers []struct {
			Domain string `json:"domain"`
		} `json:"referrers"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		log.Printf("Cache: AI referrers parse error: %v", err)
		return
	}

	var domains []string
	for _, r := range resp.Referrers {
		if len(r.Domain) > 0 && len(r.Domain) < 256 {
			domains = append(domains, r.Domain)
		}
	}

	if len(domains) > 0 {
		c.mu.Lock()
		c.refs = domains
		c.refEtag = etag
		c.mu.Unlock()
		log.Printf("Cache: updated AI referrers (%d domains)", len(domains))
	}
}

// fetchList sends a signed GET request with ETag support.
// Returns (body, etag, err). body is nil on 304 Not Modified.
func (c *signatureListCache) fetchList(apiPath, currentEtag string) ([]byte, string, error) {
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	sig := hmacSign(timestamp, "GET", apiPath, "", c.cfg.APISecret)

	urlPath := apiPath[len("/api/v1"):]
	url := trimRight(c.cfg.APIURL, '/') + urlPath

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}

	req.Header.Set("X-API-Key", c.cfg.APIKey)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Signature", sig)
	req.Header.Set("User-Agent", "AilabsauditTracker/"+version+" LogAgent-Go")

	if currentEtag != "" {
		req.Header.Set("If-None-Match", currentEtag)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return nil, "", nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Limit body read to 1 MB.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, "", err
	}

	newEtag := resp.Header.Get("ETag")
	return body, newEtag, nil
}

// hmacSign computes HMAC-SHA256: "{timestamp}\n{method}\n{path}\n{body}"
func hmacSign(timestamp, method, path, body, secret string) string {
	msg := timestamp + "\n" + method + "\n" + path + "\n" + body
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	return hex.EncodeToString(mac.Sum(nil))
}

func trimRight(s string, c byte) string {
	for len(s) > 0 && s[len(s)-1] == c {
		s = s[:len(s)-1]
	}
	return s
}
