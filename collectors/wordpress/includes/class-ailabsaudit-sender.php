<?php
/**
 * HTTP sender — sends signed payloads to the AI Labs Audit API.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AiLabsAudit_Sender {

	/**
	 * @var AiLabsAudit_Signer
	 */
	private $signer;

	public function __construct( AiLabsAudit_Signer $signer ) {
		$this->signer = $signer;
	}

	/**
	 * Send a tracking event to the API.
	 *
	 * @param array  $payload    Event payload.
	 * @param string $api_url    Ingestion endpoint URL.
	 * @param string $api_secret HMAC secret.
	 * @return array{success: bool, status_code: int, body: string}
	 */
	public function send( array $payload, string $api_url, string $api_secret ): array {
		$canonical = $this->signer->canonicalize( $payload );
		$signature = $this->signer->header( $canonical, $api_secret );
		$timestamp = $payload['timestamp'] ?? gmdate( 'c' );

		$response = wp_remote_post( $api_url, array(
			'body'      => $canonical,
			'timeout'   => 5,
			'blocking'  => false,
			'sslverify' => true,
			'headers'   => array(
				'Content-Type' => 'application/json',
				'X-Tracker-Id' => $payload['tracker_id'] ?? '',
				'X-Signature'  => $signature,
				'X-Timestamp'  => $timestamp,
				'User-Agent'   => 'AiLabsAudit-WP/' . AILABSAUDIT_TRACKER_VERSION,
			),
		) );

		if ( is_wp_error( $response ) ) {
			return array(
				'success'     => false,
				'status_code' => 0,
				'body'        => $response->get_error_message(),
			);
		}

		$status_code = wp_remote_retrieve_response_code( $response );

		return array(
			'success'     => $status_code >= 200 && $status_code < 300,
			'status_code' => $status_code,
			'body'        => wp_remote_retrieve_body( $response ),
		);
	}
}
