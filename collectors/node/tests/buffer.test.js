'use strict';

/**
 * Buffer tests — add, cap, flush, debounce, retry, shutdown.
 *
 * Run: node tests/buffer.test.js
 */

const { EventBuffer, MAX_BUFFER_SIZE } = require('../src/buffer');

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}`);
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  // -----------------------------------------------------------------
  // Basic add
  // -----------------------------------------------------------------
  console.log('\n--- Basic add ---');

  {
    const buffer = new EventBuffer({
      sendEvents: async (events) => ({ success: true, statusCode: 202 }),
    });

    buffer.add({ type: 'bot_crawl', url: '/test' });
    assert('add increments size', buffer.size === 1);

    buffer.add({ type: 'bot_crawl', url: '/test2' });
    assert('add increments again', buffer.size === 2);
  }

  // -----------------------------------------------------------------
  // Buffer cap
  // -----------------------------------------------------------------
  console.log('\n--- Buffer cap ---');

  {
    const buffer = new EventBuffer({
      sendEvents: async () => ({ success: true, statusCode: 202 }),
    });

    buffer._lastFlushAt = 0;

    for (let i = 0; i < MAX_BUFFER_SIZE + 10; i++) {
      buffer.add({ type: 'bot_crawl', url: `/page-${i}` });
      if (buffer.size >= MAX_BUFFER_SIZE) {
        buffer._lastFlushAt = 0;
      }
    }

    assert('buffer never exceeds MAX_BUFFER_SIZE',
      buffer.size <= MAX_BUFFER_SIZE);
  }

  // -----------------------------------------------------------------
  // Flush sends events
  // -----------------------------------------------------------------
  console.log('\n--- Flush ---');

  {
    let sentBatch = null;
    const buffer = new EventBuffer({
      sendEvents: async (events) => {
        sentBatch = events;
        return { success: true, statusCode: 202 };
      },
    });

    buffer.add({ type: 'bot_crawl', url: '/flush-test' });
    buffer._lastFlushAt = 0;
    buffer.flush();

    await delay(10);

    assert('flush sends events', sentBatch !== null && sentBatch.length === 1);
    assert('buffer is empty after flush', buffer.size === 0);
  }

  // -----------------------------------------------------------------
  // Debounce
  // -----------------------------------------------------------------
  console.log('\n--- Debounce ---');

  {
    let flushCount = 0;
    const buffer = new EventBuffer({
      sendEvents: async () => {
        flushCount++;
        return { success: true, statusCode: 202 };
      },
    });

    buffer.add({ type: 'bot_crawl', url: '/d1' });
    buffer.flush();
    await delay(10);
    const firstCount = flushCount;

    buffer.add({ type: 'bot_crawl', url: '/d2' });
    buffer.flush(); // Should be debounced.

    await delay(10);
    assert('second flush is debounced', flushCount === firstCount);
  }

  // -----------------------------------------------------------------
  // Retry on error
  // -----------------------------------------------------------------
  console.log('\n--- Retry ---');

  {
    const buffer = new EventBuffer({
      sendEvents: async () => ({ success: false, statusCode: 500, body: 'error' }),
    });

    buffer.add({ type: 'bot_crawl', url: '/retry' });
    buffer._lastFlushAt = 0;
    buffer.flush();
    await delay(10);

    assert('events re-stored after 5xx', buffer.size === 1);
    assert('retry count incremented', buffer._retryCount === 1);
  }

  // -----------------------------------------------------------------
  // Auth error drops events
  // -----------------------------------------------------------------
  console.log('\n--- Auth error ---');

  {
    const buffer = new EventBuffer({
      sendEvents: async () => ({ success: false, statusCode: 401, body: 'unauthorized' }),
    });

    buffer.add({ type: 'bot_crawl', url: '/auth' });
    buffer._lastFlushAt = 0;
    buffer.flush();
    await delay(10);

    assert('events dropped on 401', buffer.size === 0);
  }

  // -----------------------------------------------------------------
  // Shutdown flushes
  // -----------------------------------------------------------------
  console.log('\n--- Shutdown ---');

  {
    let shutdownEvents = null;
    const buffer = new EventBuffer({
      sendEvents: async (events) => {
        shutdownEvents = events;
        return { success: true, statusCode: 202 };
      },
    });

    buffer.add({ type: 'bot_crawl', url: '/shutdown' });
    await buffer.shutdown();

    assert('shutdown flushes remaining events',
      shutdownEvents !== null && shutdownEvents.length === 1);
    assert('buffer empty after shutdown', buffer.size === 0);
  }

  // -----------------------------------------------------------------
  // Results
  // -----------------------------------------------------------------
  const total = passed + failed;
  console.log(`\nResults: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
})();
