<?php

/**
 * Detection tests — matchBot, matchReferrer, false positives.
 *
 * Run: php tests/DetectionTest.php
 */

require_once __DIR__ . '/../src/Defaults.php';
require_once __DIR__ . '/../src/Detector.php';

use AilabsAudit\Tracker\Defaults;
use AilabsAudit\Tracker\Detector;

$botSignatures = Defaults::botSignatures();
$aiReferrers   = Defaults::aiReferrers();

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

// -----------------------------------------------------------------
// matchBot
// -----------------------------------------------------------------
echo "\n--- matchBot ---\n";

check('detects GPTBot',
    Detector::matchBot('Mozilla/5.0 (compatible; GPTBot/1.0)', $botSignatures) === 'GPTBot');

check('detects ClaudeBot',
    Detector::matchBot('ClaudeBot/1.0', $botSignatures) === 'ClaudeBot');

check('detects case-insensitive',
    Detector::matchBot('mozilla/5.0 gptbot/1.0', $botSignatures) === 'GPTBot');

check('detects PerplexityBot',
    Detector::matchBot('Mozilla/5.0 PerplexityBot/1.0', $botSignatures) === 'PerplexityBot');

check('detects DeepSeekBot',
    Detector::matchBot('DeepSeekBot/1.0', $botSignatures) === 'DeepSeekBot');

check('detects bingbot',
    Detector::matchBot('Mozilla/5.0 (compatible; bingbot/2.0)', $botSignatures) === 'bingbot');

check('detects Googlebot',
    Detector::matchBot('Googlebot/2.1', $botSignatures) !== null);

check('no match Chrome',
    Detector::matchBot('Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36', $botSignatures) === null);

check('no match Firefox',
    Detector::matchBot('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Firefox/121.0', $botSignatures) === null);

check('empty UA',
    Detector::matchBot('', $botSignatures) === null);

check('curl',
    Detector::matchBot('curl/8.4.0', $botSignatures) === null);

// -----------------------------------------------------------------
// matchReferrer
// -----------------------------------------------------------------
echo "\n--- matchReferrer ---\n";

check('matches chatgpt.com',
    Detector::matchReferrer('chatgpt.com', $aiReferrers) === 'chatgpt.com');

check('matches claude.ai',
    Detector::matchReferrer('claude.ai', $aiReferrers) === 'claude.ai');

check('matches subdomain',
    Detector::matchReferrer('labs.perplexity.ai', $aiReferrers) !== null);

check('case-insensitive',
    Detector::matchReferrer('ChatGPT.com', $aiReferrers) === 'chatgpt.com');

check('matches deepseek.com',
    Detector::matchReferrer('deepseek.com', $aiReferrers) === 'deepseek.com');

check('no match google.com',
    Detector::matchReferrer('google.com', $aiReferrers) === null);

check('no match facebook.com',
    Detector::matchReferrer('facebook.com', $aiReferrers) === null);

check('empty',
    Detector::matchReferrer('', $aiReferrers) === null);

// -----------------------------------------------------------------
// False positives
// -----------------------------------------------------------------
echo "\n--- False positives ---\n";

$normalUAs = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Firefox/121.0',
    'Wget/1.21',
    'PostmanRuntime/7.36.0',
    'python-requests/2.31.0',
];

foreach ($normalUAs as $ua) {
    check('no FP: ' . substr($ua, 0, 50),
        Detector::matchBot($ua, $botSignatures) === null);
}

$normalRefs = ['google.com', 'www.google.com', 'facebook.com', 'twitter.com', 'reddit.com'];

foreach ($normalRefs as $ref) {
    check("no FP referrer: $ref",
        Detector::matchReferrer($ref, $aiReferrers) === null);
}

// -----------------------------------------------------------------
// Results
// -----------------------------------------------------------------
$total = $passed + $failed;
echo "\nResults: {$passed}/{$total} passed" . ($failed > 0 ? ", {$failed} FAILED" : '') . "\n";
exit($failed > 0 ? 1 : 0);
