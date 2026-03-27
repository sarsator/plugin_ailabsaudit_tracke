// Package main — ailabsaudit-agent entry point.
//
// Lightweight log-tail agent for AI bot detection.
// Reads web server access logs, detects AI bot crawls and referral traffic,
// and sends HMAC-signed batches to the AI Labs Audit API.
//
// Zero external dependencies — Go stdlib only.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
)

const version = "1.0.0"

func main() {
	configPath := flag.String("config", "/etc/ailabsaudit/agent.conf", "Path to config file")
	showVersion := flag.Bool("version", false, "Show version")
	flag.Parse()

	if *showVersion {
		fmt.Printf("ailabsaudit-agent v%s\n", version)
		os.Exit(0)
	}

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("Config error: %v", err)
	}

	log.Printf("ailabsaudit-agent v%s starting", version)
	log.Printf("Tailing: %s", cfg.LogPath)
	log.Printf("API: %s", cfg.APIURL)
	log.Printf("Defaults: %d bots, %d referrers", len(botSignatures), len(aiReferrers))

	// Initialize list cache (refreshes from API every 24h).
	initListCache(cfg)

	snd := newSender(cfg)
	buffer := newEventBuffer(cfg.BufferSize, cfg.FlushInterval, cfg.FlushDebounce, cfg.MaxRetries, snd.send)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start API list refresh in background.
	listCache.startRefresh(ctx)

	// Graceful shutdown.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-sigCh
		log.Printf("Received %v, shutting down...", sig)
		cancel()
	}()

	buffer.start(ctx)

	// Stats counters.
	var linesProcessed, eventsMatched uint64

	// Stats reporter + update checker (every 5 min).
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		updateCheck := time.NewTicker(24 * time.Hour)
		defer updateCheck.Stop()

		// Check for update on startup (after 30s delay).
		time.AfterFunc(30*time.Second, func() {
			if newVer := snd.checkUpdate(); newVer != "" {
				log.Printf("Update available: v%s → v%s. Run install.sh to update.", version, newVer)
			}
		})

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				dropped, flushErr := buffer.stats()
				log.Printf("Stats: lines=%d matched=%d buffered=%d dropped=%d flush_errors=%d",
					atomic.LoadUint64(&linesProcessed),
					atomic.LoadUint64(&eventsMatched),
					buffer.size(),
					dropped, flushErr)
			case <-updateCheck.C:
				if newVer := snd.checkUpdate(); newVer != "" {
					log.Printf("Update available: v%s → v%s. Run install.sh to update.", version, newVer)
				}
			}
		}
	}()

	// Tail log file.
	err = tailFile(ctx, cfg.LogPath, func(line string) {
		atomic.AddUint64(&linesProcessed, 1)

		parsed := parseLogLine(line)
		if parsed == nil {
			return
		}

		event := detectEvent(parsed)
		if event != nil {
			atomic.AddUint64(&eventsMatched, 1)
			buffer.add(event)
		}
	})

	if err != nil && ctx.Err() == nil {
		log.Printf("Tail error: %v", err)
		// Report fatal error to API.
		snd.sendDiagnostic("tail_error", err.Error())
	}

	// Flush remaining with timeout.
	log.Println("Flushing remaining events...")
	shutdownDone := make(chan struct{})
	go func() {
		buffer.stop()
		close(shutdownDone)
	}()

	select {
	case <-shutdownDone:
	case <-time.After(15 * time.Second):
		log.Println("Shutdown timeout — some events may be lost")
		snd.sendDiagnostic("shutdown_timeout", "buffer flush timed out after 15s")
	}

	// Report final stats.
	dropped, flushErr := buffer.stats()
	log.Printf("Final: lines=%d events=%d dropped=%d errors=%d",
		atomic.LoadUint64(&linesProcessed),
		atomic.LoadUint64(&eventsMatched),
		dropped, flushErr)

	if dropped > 0 {
		snd.sendDiagnostic("events_dropped", fmt.Sprintf("%d events dropped during session", dropped))
	}

	log.Println("Agent stopped.")
}
