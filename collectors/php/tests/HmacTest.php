<?php

/**
 * HMAC Test — validates canonicalize + sign against spec/test-vectors.json.
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
    $canonical = AilabsTracker::canonicalize($v['payload']);
    $signature = AilabsTracker::sign($canonical, $secret);
    $header    = AilabsTracker::signatureHeader($canonical, $secret);

    // Check canonical form.
    if ($canonical !== $v['canonical']) {
        $failed++;
        echo "  FAIL [{$name}] canonical mismatch\n";
        echo "    expected: {$v['canonical']}\n";
        echo "    actual:   {$canonical}\n";
        continue;
    }

    // Check signature.
    if ($signature !== $v['signature']) {
        $failed++;
        echo "  FAIL [{$name}] signature mismatch\n";
        echo "    expected: {$v['signature']}\n";
        echo "    actual:   {$signature}\n";
        continue;
    }

    // Check header format.
    if ($header !== $v['header']) {
        $failed++;
        echo "  FAIL [{$name}] header mismatch\n";
        echo "    expected: {$v['header']}\n";
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
