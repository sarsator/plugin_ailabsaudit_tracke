<?php

/**
 * Buffer tests — add, flush, file persistence.
 *
 * Run: php tests/BufferTest.php
 */

require_once __DIR__ . '/../src/Defaults.php';
require_once __DIR__ . '/../src/Detector.php';
require_once __DIR__ . '/../src/AilabsTracker.php';
require_once __DIR__ . '/../src/Cache.php';
require_once __DIR__ . '/../src/Buffer.php';

use AilabsAudit\Tracker\Buffer;

$passed = 0;
$failed = 0;

function check(string $name, bool $condition): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  PASS: $name\n";
    } else {
        $failed++;
        echo "  FAIL: $name\n";
    }
}

$tmpDir = sys_get_temp_dir() . '/ailabs_test_' . getmypid();
if (!is_dir($tmpDir)) {
    mkdir($tmpDir, 0750, true);
}

function cleanup(string $tmpDir): void
{
    $files = glob($tmpDir . '/*');
    if (is_array($files)) {
        foreach ($files as $f) {
            @unlink($f);
        }
    }
    @rmdir($tmpDir);
}

register_shutdown_function('cleanup', $tmpDir);

// -----------------------------------------------------------------
// Basic add
// -----------------------------------------------------------------
echo "\n--- Basic add ---\n";

{
    $path = $tmpDir . '/buffer_add.json';
    $sent = [];
    $buffer = new Buffer($path, function (array $events) use (&$sent): array {
        $sent = array_merge($sent, $events);
        return ['success' => true, 'status_code' => 202];
    });

    $buffer->add(['type' => 'bot_crawl', 'url' => '/test']);
    check('add increments size', $buffer->size() === 1);

    $buffer->add(['type' => 'bot_crawl', 'url' => '/test2']);
    check('add increments again', $buffer->size() === 2);
}

// -----------------------------------------------------------------
// File persistence
// -----------------------------------------------------------------
echo "\n--- File persistence ---\n";

{
    $path = $tmpDir . '/buffer_persist.json';
    @unlink($path);

    // Create buffer and add events.
    $buffer1 = new Buffer($path, function (array $events): array {
        return ['success' => true, 'status_code' => 202];
    });

    $buffer1->add(['type' => 'bot_crawl', 'url' => '/persist1']);
    $buffer1->add(['type' => 'bot_crawl', 'url' => '/persist2']);
    // Manually save (simulates shutdown).
    // Since save does a flush, we need events to remain.
    // Let's write directly.
    file_put_contents($path, json_encode([
        ['type' => 'bot_crawl', 'url' => '/persist1'],
        ['type' => 'bot_crawl', 'url' => '/persist2'],
    ]), LOCK_EX);

    // Create new buffer from same file — should load persisted events.
    $buffer2 = new Buffer($path, function (array $events): array {
        return ['success' => true, 'status_code' => 202];
    });

    check('loads persisted events', $buffer2->size() === 2);
}

// -----------------------------------------------------------------
// Flush sends events
// -----------------------------------------------------------------
echo "\n--- Flush ---\n";

{
    $path = $tmpDir . '/buffer_flush.json';
    @unlink($path);
    @unlink($path . '.lastflush');

    $sent = [];
    $buffer = new Buffer($path, function (array $events) use (&$sent): array {
        $sent = $events;
        return ['success' => true, 'status_code' => 202];
    });

    $buffer->add(['type' => 'bot_crawl', 'url' => '/flush']);
    // Force flush by setting file age.
    if (file_exists($path)) {
        touch($path, time() - 600);
    }
    $buffer->flush();

    check('flush sends events', count($sent) > 0);
}

// -----------------------------------------------------------------
// Auth error drops events
// -----------------------------------------------------------------
echo "\n--- Auth error ---\n";

{
    $path = $tmpDir . '/buffer_auth.json';
    @unlink($path);
    @unlink($path . '.lastflush');

    $buffer = new Buffer($path, function (array $events): array {
        return ['success' => false, 'status_code' => 401];
    });

    $buffer->add(['type' => 'bot_crawl', 'url' => '/auth']);
    if (file_exists($path)) {
        touch($path, time() - 600);
    }
    $buffer->flush();

    check('events dropped on 401', $buffer->size() === 0);
}

// -----------------------------------------------------------------
// Results
// -----------------------------------------------------------------
$total = $passed + $failed;
echo "\nResults: {$passed}/{$total} passed" . ($failed > 0 ? ", {$failed} FAILED" : '') . "\n";
exit($failed > 0 ? 1 : 0);
