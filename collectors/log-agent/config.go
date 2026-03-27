package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

// config holds all agent configuration.
type config struct {
	APIKey    string `json:"api_key"`
	APISecret string `json:"api_secret"`
	ClientID  string `json:"client_id"`
	APIURL    string `json:"api_url"`
	LogPath   string `json:"log_path"`

	// Tuning (optional, sane defaults).
	BufferSize    int           `json:"buffer_size"`
	FlushInterval time.Duration `json:"flush_interval_seconds"`
	FlushDebounce time.Duration `json:"flush_debounce_seconds"`
	MaxRetries    int           `json:"max_retries"`
}

func loadConfig(path string) (*config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read %s: %w", path, err)
	}

	var raw struct {
		APIKey        string `json:"api_key"`
		APISecret     string `json:"api_secret"`
		ClientID      string `json:"client_id"`
		APIURL        string `json:"api_url"`
		LogPath       string `json:"log_path"`
		BufferSize    int    `json:"buffer_size"`
		FlushInterval int    `json:"flush_interval_seconds"`
		FlushDebounce int    `json:"flush_debounce_seconds"`
		MaxRetries    int    `json:"max_retries"`
	}

	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("invalid JSON in %s: %w", path, err)
	}

	cfg := &config{
		APIKey:    raw.APIKey,
		APISecret: raw.APISecret,
		ClientID:  raw.ClientID,
		APIURL:    raw.APIURL,
		LogPath:   raw.LogPath,
	}

	// Validate required fields.
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("missing 'api_key' in %s", path)
	}
	if cfg.APISecret == "" {
		return nil, fmt.Errorf("missing 'api_secret' in %s", path)
	}
	if cfg.ClientID == "" {
		return nil, fmt.Errorf("missing 'client_id' in %s", path)
	}
	if cfg.APIURL == "" {
		return nil, fmt.Errorf("missing 'api_url' in %s", path)
	}

	// Auto-detect log path if not set.
	if cfg.LogPath == "" {
		detected := detectLogPath()
		if detected == "" {
			return nil, fmt.Errorf("no 'log_path' configured and auto-detection failed")
		}
		cfg.LogPath = detected
	}

	// Defaults with validation.
	cfg.BufferSize = 500
	if raw.BufferSize > 0 && raw.BufferSize <= 10000 {
		cfg.BufferSize = raw.BufferSize
	} else if raw.BufferSize > 10000 {
		return nil, fmt.Errorf("buffer_size must be <= 10000, got %d", raw.BufferSize)
	}

	cfg.FlushInterval = 5 * time.Minute
	if raw.FlushInterval > 0 && raw.FlushInterval <= 3600 {
		cfg.FlushInterval = time.Duration(raw.FlushInterval) * time.Second
	} else if raw.FlushInterval > 3600 {
		return nil, fmt.Errorf("flush_interval_seconds must be <= 3600, got %d", raw.FlushInterval)
	}

	cfg.FlushDebounce = 30 * time.Second
	if raw.FlushDebounce > 0 && raw.FlushDebounce <= 300 {
		cfg.FlushDebounce = time.Duration(raw.FlushDebounce) * time.Second
	} else if raw.FlushDebounce > 300 {
		return nil, fmt.Errorf("flush_debounce_seconds must be <= 300, got %d", raw.FlushDebounce)
	}

	cfg.MaxRetries = 3
	if raw.MaxRetries > 0 && raw.MaxRetries <= 10 {
		cfg.MaxRetries = raw.MaxRetries
	} else if raw.MaxRetries > 10 {
		return nil, fmt.Errorf("max_retries must be <= 10, got %d", raw.MaxRetries)
	}

	// Validate API URL scheme.
	if cfg.APIURL != "" && !strings.HasPrefix(cfg.APIURL, "https://") {
		return nil, fmt.Errorf("api_url must use HTTPS, got %q", cfg.APIURL)
	}

	return cfg, nil
}

// detectLogPath finds the first accessible access log.
func detectLogPath() string {
	paths := []string{
		"/var/log/nginx/access.log",
		"/var/log/nginx/access_log",
		"/usr/local/nginx/logs/access.log",
		"/var/log/apache2/access.log",
		"/var/log/apache2/access_log",
		"/var/log/httpd/access_log",
		"/var/log/httpd/access.log",
		"/usr/local/lsws/logs/access.log",
		"/var/log/litespeed/access.log",
		"/var/log/caddy/access.log",
	}
	for _, p := range paths {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	return ""
}
