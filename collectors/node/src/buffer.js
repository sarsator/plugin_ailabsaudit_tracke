'use strict';

const MAX_BUFFER_SIZE = 500;
const FLUSH_INTERVAL = 300000;  // 5 minutes in ms.
const FLUSH_DEBOUNCE = 30000;   // 30 seconds in ms.
const MAX_RETRIES = 3;

/**
 * In-memory event buffer with periodic flush.
 */
class EventBuffer {
  /**
   * @param {Object} config
   * @param {Function} config.sendEvents - Async function to send events: (events) => Promise.
   */
  constructor(config) {
    this._sendEvents = config.sendEvents;
    this._events = [];
    this._flushTimer = null;
    this._lastFlushAt = 0;
    this._retryCount = 0;
  }

  /**
   * Add an event to the buffer. Auto-flushes when buffer reaches MAX_BUFFER_SIZE.
   * @param {Object} event
   */
  add(event) {
    this._events.push(event);

    // Hard cap.
    if (this._events.length > MAX_BUFFER_SIZE) {
      this._events = this._events.slice(-MAX_BUFFER_SIZE);
    }

    if (this._events.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  /** Start periodic flush timer. */
  start() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL);
    this._flushTimer.unref();
  }

  /** Stop periodic flush and flush remaining events. */
  async shutdown() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    await this._doFlush();
  }

  /** Trigger a flush (with debounce protection). */
  flush() {
    const now = Date.now();
    if (now - this._lastFlushAt < FLUSH_DEBOUNCE) {
      return;
    }
    this._doFlush();
  }

  /** @private */
  async _doFlush() {
    if (this._events.length === 0) return;

    const events = this._events.splice(0);
    this._lastFlushAt = Date.now();

    try {
      const result = await this._sendEvents(events);
      if (result.success) {
        this._retryCount = 0;
        return;
      }

      if (result.statusCode === 401 || result.statusCode === 403) {
        // Auth error, don't re-buffer.
        return;
      }

      // Retryable error (429, 5xx).
      this._reStore(events);
    } catch (err) {
      this._reStore(events);
    }
  }

  /**
   * Put events back in the buffer for retry.
   * @private
   */
  _reStore(events) {
    if (this._retryCount >= MAX_RETRIES) {
      this._retryCount = 0;
      return;
    }
    this._retryCount++;
    // Prepend old events, respect cap.
    this._events = events.concat(this._events).slice(0, MAX_BUFFER_SIZE);
  }

  /** @returns {number} Current buffer size. */
  get size() {
    return this._events.length;
  }
}

module.exports = { EventBuffer, MAX_BUFFER_SIZE, FLUSH_INTERVAL, FLUSH_DEBOUNCE, MAX_RETRIES };
