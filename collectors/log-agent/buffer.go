package main

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

// eventBuffer accumulates events and flushes them in batches.
// Thread-safe via sync.Mutex.
type eventBuffer struct {
	mu            sync.Mutex
	events        []*event
	maxSize       int
	flushInterval time.Duration
	flushDebounce time.Duration
	lastFlush     time.Time
	retryCount    int
	maxRetries    int
	sendFn        func([]*event) sendResult
	cancel        context.CancelFunc
	done          chan struct{}

	// Observability counters.
	eventsDropped uint64
	flushErrors   uint64
}

func newEventBuffer(maxSize int, flushInterval, flushDebounce time.Duration, maxRetries int, sendFn func([]*event) sendResult) *eventBuffer {
	return &eventBuffer{
		events:        make([]*event, 0, maxSize),
		maxSize:       maxSize,
		flushInterval: flushInterval,
		flushDebounce: flushDebounce,
		maxRetries:    maxRetries,
		sendFn:        sendFn,
		done:          make(chan struct{}),
	}
}

func (b *eventBuffer) add(e *event) {
	shouldFlush := false
	b.mu.Lock()
	b.events = append(b.events, e)
	// Cap: drop OLDEST events (keep newest).
	if len(b.events) > b.maxSize {
		dropped := len(b.events) - b.maxSize
		b.events = b.events[dropped:]
		atomic.AddUint64(&b.eventsDropped, uint64(dropped))
		log.Printf("Buffer: overflow, dropped %d oldest events", dropped)
	}
	if len(b.events) >= b.maxSize {
		shouldFlush = true
	}
	b.mu.Unlock()

	if shouldFlush {
		b.flush()
	}
}

func (b *eventBuffer) start(ctx context.Context) {
	ctx, b.cancel = context.WithCancel(ctx)

	go func() {
		ticker := time.NewTicker(b.flushInterval)
		defer ticker.Stop()
		defer close(b.done)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				b.flush()
			}
		}
	}()
}

func (b *eventBuffer) stop() {
	if b.cancel != nil {
		b.cancel()
		// Wait for flush goroutine with timeout.
		select {
		case <-b.done:
		case <-time.After(10 * time.Second):
			log.Println("Buffer: shutdown timeout waiting for flush goroutine")
		}
	}
	b.doFlush()

	dropped := atomic.LoadUint64(&b.eventsDropped)
	errors := atomic.LoadUint64(&b.flushErrors)
	if dropped > 0 || errors > 0 {
		log.Printf("Buffer: total dropped=%d, flush_errors=%d", dropped, errors)
	}
}

func (b *eventBuffer) flush() {
	b.mu.Lock()
	tooSoon := time.Since(b.lastFlush) < b.flushDebounce
	b.mu.Unlock()
	if tooSoon {
		return
	}
	b.doFlush()
}

func (b *eventBuffer) doFlush() {
	b.mu.Lock()
	if len(b.events) == 0 {
		b.mu.Unlock()
		return
	}
	events := b.events
	b.events = make([]*event, 0, b.maxSize)
	b.lastFlush = time.Now()
	b.mu.Unlock()

	result := b.sendFn(events)
	if result.Success {
		b.retryCount = 0
		return
	}

	atomic.AddUint64(&b.flushErrors, 1)

	// Auth errors: log warning, don't re-store (credentials are wrong).
	if result.StatusCode == 401 || result.StatusCode == 403 {
		log.Printf("Buffer: auth error (HTTP %d), %d events discarded — check credentials", result.StatusCode, len(events))
		atomic.AddUint64(&b.eventsDropped, uint64(len(events)))
		return
	}

	// Retry limit reached: drop events.
	if b.retryCount >= b.maxRetries {
		log.Printf("Buffer: max retries (%d) reached, %d events discarded", b.maxRetries, len(events))
		atomic.AddUint64(&b.eventsDropped, uint64(len(events)))
		b.retryCount = 0
		return
	}

	b.retryCount++

	// Re-store: keep NEWEST events (old events go first, new buffer appended).
	b.mu.Lock()
	combined := make([]*event, 0, b.maxSize)
	combined = append(combined, events...)
	combined = append(combined, b.events...)
	// Keep oldest first (FIFO), truncate from the end if over cap.
	if len(combined) > b.maxSize {
		dropped := len(combined) - b.maxSize
		combined = combined[:b.maxSize]
		atomic.AddUint64(&b.eventsDropped, uint64(dropped))
	}
	b.events = combined
	b.mu.Unlock()
}

func (b *eventBuffer) size() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.events)
}

func (b *eventBuffer) stats() (dropped, errors uint64) {
	return atomic.LoadUint64(&b.eventsDropped), atomic.LoadUint64(&b.flushErrors)
}
