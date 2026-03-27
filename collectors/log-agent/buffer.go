package main

import (
	"context"
	"sync"
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
	sendFn        func([]*event) sendResult
	cancel        context.CancelFunc
	done          chan struct{}
}

func newEventBuffer(maxSize int, flushInterval, flushDebounce time.Duration, sendFn func([]*event) sendResult) *eventBuffer {
	return &eventBuffer{
		events:        make([]*event, 0, maxSize),
		maxSize:       maxSize,
		flushInterval: flushInterval,
		flushDebounce: flushDebounce,
		sendFn:        sendFn,
		done:          make(chan struct{}),
	}
}

func (b *eventBuffer) add(e *event) {
	shouldFlush := false
	b.mu.Lock()
	b.events = append(b.events, e)
	if len(b.events) > b.maxSize {
		b.events = b.events[len(b.events)-b.maxSize:]
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
		<-b.done
	}
	b.doFlush()
}

func (b *eventBuffer) flush() {
	now := time.Now()
	b.mu.Lock()
	tooSoon := now.Sub(b.lastFlush) < b.flushDebounce
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
		return
	}
	// Don't re-store on auth errors.
	if result.StatusCode == 401 || result.StatusCode == 403 {
		return
	}
	// Re-store for retry on transient errors.
	b.mu.Lock()
	combined := append(events, b.events...)
	if len(combined) > b.maxSize {
		combined = combined[:b.maxSize]
	}
	b.events = combined
	b.mu.Unlock()
}

func (b *eventBuffer) size() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.events)
}
