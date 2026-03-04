<?php
/**
 * Unit tests for AiLabsAudit_Signer.
 *
 * Run with: phpunit --bootstrap=bootstrap.php test-signer.php
 */

// Minimal bootstrap to test without full WordPress.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/tmp/' );
}
if ( ! function_exists( 'wp_json_encode' ) ) {
	function wp_json_encode( $data, $options = 0, $depth = 512 ) {
		return json_encode( $data, $options, $depth );
	}
}

require_once dirname( __DIR__ ) . '/includes/class-ailabsaudit-signer.php';

use PHPUnit\Framework\TestCase;

class Test_AiLabsAudit_Signer extends TestCase {

	private AiLabsAudit_Signer $signer;
	private string $secret = 'whsec_test_secret_key_for_ailabsaudit_tracker';

	protected function setUp(): void {
		$this->signer = new AiLabsAudit_Signer();
	}

	public function test_canonicalize_sorts_keys(): void {
		$payload = array(
			'url'        => 'https://example.com',
			'event'      => 'page_view',
			'tracker_id' => 'TRK-001',
			'timestamp'  => '2026-03-04T12:00:00Z',
		);

		$result = $this->signer->canonicalize( $payload );
		$this->assertSame(
			'{"event":"page_view","timestamp":"2026-03-04T12:00:00Z","tracker_id":"TRK-001","url":"https://example.com"}',
			$result
		);
	}

	public function test_canonicalize_sorts_nested_keys(): void {
		$payload = array(
			'url'        => 'https://example.com/pricing',
			'event'      => 'cta_click',
			'tracker_id' => 'TRK-002',
			'timestamp'  => '2026-03-04T12:05:00Z',
			'meta'       => array(
				'button_text' => 'Start Free Trial',
				'button_id'   => 'signup-hero',
			),
		);

		$result = $this->signer->canonicalize( $payload );
		$this->assertSame(
			'{"event":"cta_click","meta":{"button_id":"signup-hero","button_text":"Start Free Trial"},"timestamp":"2026-03-04T12:05:00Z","tracker_id":"TRK-002","url":"https://example.com/pricing"}',
			$result
		);
	}

	public function test_sign_minimal_payload(): void {
		$canonical = '{"event":"page_view","timestamp":"2026-03-04T12:00:00Z","tracker_id":"TRK-001","url":"https://example.com"}';
		$signature = $this->signer->sign( $canonical, $this->secret );
		$this->assertSame( '38a1f33bab70b46143c0a9528640be0fee83a9ddcbb94395018460f6b81394ce', $signature );
	}

	public function test_sign_full_payload(): void {
		$canonical = '{"event":"page_view","ip":"192.168.1.1","meta":{"duration":4500,"scroll_depth":75},"referrer":"https://google.com","timestamp":"2026-03-04T12:00:00Z","tracker_id":"TRK-001","url":"https://example.com/blog/article-1","user_agent":"Mozilla/5.0"}';
		$signature = $this->signer->sign( $canonical, $this->secret );
		$this->assertSame( '56d7f6f528362848e0bc06681866b2951a11d2794cf2f30e13e72a3e14d04632', $signature );
	}

	public function test_sign_cta_click(): void {
		$canonical = '{"event":"cta_click","meta":{"button_id":"signup-hero","button_text":"Start Free Trial"},"timestamp":"2026-03-04T12:05:00Z","tracker_id":"TRK-002","url":"https://example.com/pricing"}';
		$signature = $this->signer->sign( $canonical, $this->secret );
		$this->assertSame( '9c9c4e279ccb8c77331c7e55be844c25b6cb06148ee5af197c28439e22ff7292', $signature );
	}

	public function test_header_format(): void {
		$canonical = '{"event":"page_view","timestamp":"2026-03-04T12:00:00Z","tracker_id":"TRK-001","url":"https://example.com"}';
		$header    = $this->signer->header( $canonical, $this->secret );
		$this->assertStringStartsWith( 'sha256=', $header );
		$this->assertSame( 'sha256=38a1f33bab70b46143c0a9528640be0fee83a9ddcbb94395018460f6b81394ce', $header );
	}

	public function test_end_to_end_canonicalize_and_sign(): void {
		$payload = array(
			'url'        => 'https://example.com',
			'event'      => 'page_view',
			'tracker_id' => 'TRK-001',
			'timestamp'  => '2026-03-04T12:00:00Z',
		);

		$canonical = $this->signer->canonicalize( $payload );
		$signature = $this->signer->sign( $canonical, $this->secret );
		$this->assertSame( '38a1f33bab70b46143c0a9528640be0fee83a9ddcbb94395018460f6b81394ce', $signature );
	}
}
