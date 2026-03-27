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
	// Drain body to reuse connection.
	io.Copy(io.Discard, resp.Body)

	success := resp.StatusCode >= 200 && resp.StatusCode < 300
	if !success && resp.StatusCode != 401 && resp.StatusCode != 403 {
		log.Printf("Sender: API returned HTTP %d", resp.StatusCode)
	}

	return sendResult{Success: success, StatusCode: resp.StatusCode}
}

// uuid4 generates a random UUID v4 string.
func uuid4() string {
	var b [16]byte
	rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
