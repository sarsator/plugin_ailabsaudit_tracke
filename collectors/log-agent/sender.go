package main

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// sendResult holds the outcome of an API call.
type sendResult struct {
	Success    bool
	StatusCode int
}

// sender sends signed event batches to the API.
type sender struct {
	cfg    *config
	client *http.Client
}

func newSender(cfg *config) *sender {
	return &sender{
		cfg: cfg,
		client: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					MinVersion: tls.VersionTLS12,
				},
				MaxIdleConns:        5,
				IdleConnTimeout:     60 * time.Second,
				DisableKeepAlives:   false,
				MaxConnsPerHost:     2,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		},
	}
}

// payload is the batch envelope sent to the API.
type payload struct {
	ClientID      string   `json:"client_id"`
	PluginType    string   `json:"plugin_type"`
	PluginVersion string   `json:"plugin_version"`
	BatchID       string   `json:"batch_id"`
	Events        []*event `json:"events"`
}

func (s *sender) send(events []*event) sendResult {
	body, err := json.Marshal(&payload{
		ClientID:      s.cfg.ClientID,
		PluginType:    "log-agent",
		PluginVersion: version,
		BatchID:       uuid4(),
		Events:        events,
	})
	if err != nil {
		log.Printf("Sender: JSON marshal error: %v", err)
		return sendResult{Success: false, StatusCode: 0}
	}

	apiPath := "/api/v1/tracking/events"
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	nonce := uuid4()
	sig := hmacSign(timestamp, "POST", apiPath, string(body), s.cfg.APISecret)

	url := trimRight(s.cfg.APIURL, '/') + "/tracking/events"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		log.Printf("Sender: request error: %v", err)
		return sendResult{Success: false, StatusCode: 0}
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", s.cfg.APIKey)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Nonce", nonce)
	req.Header.Set("X-Signature", sig)
	req.Header.Set("User-Agent", "AilabsauditTracker/"+version+" LogAgent-Go")

	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("Sender: network error: %v", err)
		return sendResult{Success: false, StatusCode: 0}
	}
	defer resp.Body.Close()
	// Drain body to allow connection reuse.
	if _, err := io.Copy(io.Discard, resp.Body); err != nil {
		log.Printf("Sender: body drain error: %v", err)
	}

	success := resp.StatusCode >= 200 && resp.StatusCode < 300
	if !success {
		log.Printf("Sender: API returned HTTP %d (%d events)", resp.StatusCode, len(events))
	}

	return sendResult{Success: success, StatusCode: resp.StatusCode}
}

// sendDiagnostic sends an error report to the API for remote monitoring.
// Non-blocking, best-effort — failures are silently ignored.
// Only sends: agent version, error type, error message, OS info. No credentials, no event data.
func (s *sender) sendDiagnostic(errType, errMsg string) {
	report := map[string]string{
		"client_id":      s.cfg.ClientID,
		"plugin_type":    "log-agent",
		"plugin_version": version,
		"error_type":     errType,
		"error_message":  truncate(errMsg, 500),
	}

	body, err := json.Marshal(report)
	if err != nil {
		return
	}

	apiPath := "/api/v1/tracking/diagnostic"
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	sig := hmacSign(timestamp, "POST", apiPath, string(body), s.cfg.APISecret)

	url := trimRight(s.cfg.APIURL, '/') + "/tracking/diagnostic"
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", s.cfg.APIKey)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Signature", sig)
	req.Header.Set("User-Agent", "AilabsauditTracker/"+version+" LogAgent-Go")

	resp, err := s.client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

// checkUpdate checks if a newer version is available from the API.
// Returns the new version string or empty if up-to-date.
// The client only CHECKS — it never downloads or executes anything.
// The operator must run install.sh manually to update.
func (s *sender) checkUpdate() string {
	apiPath := "/api/v1/tracking/agent-version"
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	sig := hmacSign(timestamp, "GET", apiPath, "", s.cfg.APISecret)

	url := trimRight(s.cfg.APIURL, '/') + "/tracking/agent-version"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}

	req.Header.Set("X-API-Key", s.cfg.APIKey)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Signature", sig)
	req.Header.Set("User-Agent", "AilabsauditTracker/"+version+" LogAgent-Go")

	resp, err := s.client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if err != nil {
		return ""
	}

	var result struct {
		Version string `json:"version"`
	}
	if json.Unmarshal(body, &result) != nil {
		return ""
	}

	if result.Version != "" && result.Version != version {
		return result.Version
	}
	return ""
}

// uuid4 generates a random UUID v4 string.
func uuid4() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Fallback: use time-based seed (should never happen).
		log.Printf("Sender: crypto/rand failed: %v", err)
		t := time.Now().UnixNano()
		for i := range b {
			b[i] = byte(t >> (i * 4))
		}
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
