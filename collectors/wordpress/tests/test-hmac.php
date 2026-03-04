<?php
/**
 * HMAC signing test — validates the "{timestamp}\n{method}\n{path}\n{body}" format.
 *
 * Usage: php tests/test-hmac.php
 *
 * @package Ailabsaudit_Tracker
 * @license GPL-2.0-or-later
 */

// Minimal bootstrap — no WordPress needed.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
if ( ! defined( 'AILABSAUDIT_VERSION' ) ) {
	define( 'AILABSAUDIT_VERSION', '1.0.0' );
}

// Load only the sender (contains sign()).
require_once __DIR__ . '/../includes/class-ailabsaudit-sender.php';

$secret = 'whsec_test_secret_key_for_ailabsaudit_tracker';

$vectors = array(
	array(
		'name'      => 'simple_post',
		'timestamp' => '1709553600',
		'method'    => 'POST',
		'path'      => '/api/v1/tracking/events',
		'body'      => '{"client_id":"CLT-001","events":[]}',
		'expected'  => hash_hmac(
			'sha256',
			"1709553600\nPOST\n/api/v1/tracking/events\n{\"client_id\":\"CLT-001\",\"events\":[]}",
			$secret
		),
	),
	array(
		'name'      => 'get_no_body',
		'timestamp' => '1709553600',
		'method'    => 'GET',
		'path'      => '/api/v1/bot-signatures',
		'body'      => '',
		'expected'  => hash_hmac(
			'sha256',
			"1709553600\nGET\n/api/v1/bot-signatures\n",
			$secret
		),
	),
	array(
		'name'      => 'verify_endpoint',
		'timestamp' => '1709640000',
		'method'    => 'POST',
		'path'      => '/api/v1/tracking/verify',
		'body'      => '{"test":true}',
		'expected'  => hash_hmac(
			'sha256',
			"1709640000\nPOST\n/api/v1/tracking/verify\n{\"test\":true}",
			$secret
		),
	),
);

$pass = 0;
$fail = 0;

foreach ( $vectors as $v ) {
	$result = Ailabsaudit_Sender::sign( $v['timestamp'], $v['method'], $v['path'], $v['body'], $secret );
	if ( $result === $v['expected'] ) {
		echo "PASS: {$v['name']}\n";
		$pass++;
	} else {
		echo "FAIL: {$v['name']}\n";
		echo "  expected: {$v['expected']}\n";
		echo "  got:      {$result}\n";
		$fail++;
	}
}

$total = $pass + $fail;
echo "\n{$pass}/{$total} tests passed.\n";
exit( $fail > 0 ? 1 : 0 );
