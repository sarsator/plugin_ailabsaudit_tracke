<?php

/**
 * HMAC Test — validates sign against spec/test-vectors.json.
 *
 * New format: "{timestamp}\n{method}\n{path}\n{body}"
 * Signature is raw hex (no sha256= prefix).
 * No canonicalization — body is signed as-is.
 *
 * Run:  php tests/HmacTest.php
 * Exit: 0 = all pass, 1 = failure.
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/AilabsTracker.php';

use AilabsAudit\Tracker\AilabsTracker;

// Load test vectors.
$vectorsPath = realpath(__DIR__ . '/../../../spec/test-vectors.json');
if ($vectorsPath === false || !file_exists($vectorsPath)) {
    fwrite(STDERR, "ERROR: spec/test-vectors.json not found\n");
    exit(1);
}

$data = json_decode(file_get_contents($vectorsPath), true);
$secret  = $data['secret'];
$vectors = $data['vectors'];

$passed = 0;
$failed = 0;

foreach ($vectors as $v) {
    $name      = $v['name'];
    $signature = AilabsTracker::sign($v['timestamp'], $v['method'], $v['path'], $v['body'], $secret);
    $header    = AilabsTracker::signatureHeader($v['timestamp'], $v['method'], $v['path'], $v['body'], $secret);

    // Check signature.
    if ($signature !== $v['signature']) {
        $failed++;
        echo "  FAIL [{$name}] signature mismatch\n";
        echo "    expected: {$v['signature']}\n";
        echo "    actual:   {$signature}\n";
        continue;
    }

    // Check header format (raw hex, no sha256= prefix).
    if ($header !== $v['signature']) {
        $failed++;
        echo "  FAIL [{$name}] header mismatch\n";
        echo "    expected: {$v['signature']}\n";
        echo "    actual:   {$header}\n";
        continue;
    }

    $passed++;
    echo "  PASS: {$name}\n";
}

$total = count($vectors);
echo "\nResults: {$passed}/{$total} passed";
if ($failed > 0) {
    echo ", {$failed} FAILED";
}
echo "\n";

exit($failed > 0 ? 1 : 0);
