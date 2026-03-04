<?php
/**
 * Batch sender with HMAC signing.
 *
 * HMAC format: "{timestamp}\n{method}\n{path}\n{body}"
 *
 * @package Ailabsaudit_Tracker
 * @license GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Sends buffered events to the ingestion API with HMAC-SHA256 signatures.
 */
class Ailabsaudit_Sender {

	const MAX_RETRIES = 3;

	/**
	 * Flush the buffer and send events to the API.
	 */
	public static function flush() {
		// Debounce: skip if flushed less than 30 seconds ago.
		if ( false !== get_transient( 'ailabsaudit_last_flush' ) ) {
			return;
		}
		set_transient( 'ailabsaudit_last_flush', 1, 30 );

		$api_key = get_option( 'ailabsaudit_api_key', '' );
		$secret  = get_option( 'ailabsaudit_hmac_secret', '' );
		$client  = get_option( 'ailabsaudit_client_id', '' );
		$api_url = get_option( 'ailabsaudit_api_url', AILABSAUDIT_API_URL );

		if ( '' === $api_key || '' === $secret ) {
			return;
		}

		$events = Ailabsaudit_Buffer::get_and_clear();
		if ( empty( $events ) ) {
			return;
		}

		$payload = wp_json_encode(
			array(
				'client_id'      => $client,
				'plugin_type'    => 'wordpress',
				'plugin_version' => AILABSAUDIT_VERSION,
				'batch_id'       => wp_generate_uuid4(),
				'events'         => $events,
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);

		$path      = '/api/v1/tracking/events';
		$timestamp = (string) time();
		$nonce     = wp_generate_uuid4();
		$signature = self::sign( $timestamp, 'POST', $path, $payload, $secret );

		$response = wp_remote_post(
			rtrim( $api_url, '/' ) . '/tracking/events',
			array(
				'timeout'  => 15,
				'blocking' => true,
				'headers'  => array(
					'Content-Type' => 'application/json',
					'X-API-Key'    => $api_key,
					'X-Timestamp'  => $timestamp,
					'X-Nonce'      => $nonce,
					'X-Signature'  => $signature,
					'User-Agent'   => 'AilabsauditTracker/' . AILABSAUDIT_VERSION . ' WordPress/' . get_bloginfo( 'version' ),
				),
				'body'     => $payload,
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Intentional logging.
			error_log( 'AilabsAudit: flush failed (network error).' );
			self::re_store( $events );
			return;
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 202 === $code || 200 === $code ) {
			delete_transient( 'ailabsaudit_retry_count' );
			return;
		}

		if ( 401 === $code || 403 === $code ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Intentional logging.
			error_log( 'AilabsAudit: authentication error.' );
			update_option( 'ailabsaudit_status', 'auth_error' );
			return;
		}

		if ( 429 === $code || $code >= 500 ) {
			self::re_store( $events );
		}
	}

	/**
	 * Re-store events in buffer for retry, respecting max retry count.
	 *
	 * @param array $events Events to re-store.
	 */
	private static function re_store( array $events ) {
		$retry_count = (int) get_transient( 'ailabsaudit_retry_count' );
		if ( $retry_count >= self::MAX_RETRIES ) {
			delete_transient( 'ailabsaudit_retry_count' );
			return;
		}
		set_transient( 'ailabsaudit_retry_count', $retry_count + 1, 1800 );

		$existing = get_transient( Ailabsaudit_Buffer::TRANSIENT_KEY );
		$existing = is_array( $existing ) ? $existing : array();
		$merged   = array_merge( $events, $existing );
		// Hard cap to prevent unbounded growth on repeated failures.
		$merged = array_slice( $merged, 0, Ailabsaudit_Buffer::MAX_SIZE );
		set_transient( Ailabsaudit_Buffer::TRANSIENT_KEY, $merged, Ailabsaudit_Buffer::TTL );
	}

	/**
	 * Build HMAC-SHA256 signature.
	 *
	 * Format: "{timestamp}\n{method}\n{path}\n{body}"
	 *
	 * @param string $timestamp Unix timestamp.
	 * @param string $method    HTTP method.
	 * @param string $path      API path.
	 * @param string $body      JSON body.
	 * @param string $secret    HMAC secret.
	 * @return string Hex-encoded signature.
	 */
	public static function sign( $timestamp, $method, $path, $body, $secret ) {
		$message = $timestamp . "\n" . $method . "\n" . $path . "\n" . $body;
		return hash_hmac( 'sha256', $message, $secret );
	}

	/**
	 * Verify API connection.
	 *
	 * @return array{success: bool, message: string}
	 */
	public static function verify_connection() {
		$api_key = get_option( 'ailabsaudit_api_key', '' );
		$secret  = get_option( 'ailabsaudit_hmac_secret', '' );
		$client  = get_option( 'ailabsaudit_client_id', '' );
		$api_url = get_option( 'ailabsaudit_api_url', AILABSAUDIT_API_URL );

		if ( '' === $api_key || '' === $secret ) {
			return array(
				'success' => false,
				'message' => __( 'API Key and HMAC Secret are required.', 'ailabsaudit-tracker' ),
			);
		}

		$payload = wp_json_encode(
			array(
				'tracking_api_key' => $api_key,
				'client_id'        => $client,
				'domain'           => site_url(),
				'plugin_type'      => 'wordpress',
				'plugin_version'   => AILABSAUDIT_VERSION,
				'server_info'      => array(
					'php_version'  => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
					'wp_version'   => get_bloginfo( 'version' ),
					'is_multisite' => is_multisite(),
				),
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);

		$path      = '/api/v1/tracking/verify';
		$timestamp = (string) time();
		$nonce     = wp_generate_uuid4();
		$signature = self::sign( $timestamp, 'POST', $path, $payload, $secret );

		$response = wp_remote_post(
			rtrim( $api_url, '/' ) . '/tracking/verify',
			array(
				'timeout' => 15,
				'headers' => array(
					'Content-Type' => 'application/json',
					'X-API-Key'    => $api_key,
					'X-Timestamp'  => $timestamp,
					'X-Nonce'      => $nonce,
					'X-Signature'  => $signature,
					'User-Agent'   => 'AilabsauditTracker/' . AILABSAUDIT_VERSION . ' WordPress/' . get_bloginfo( 'version' ),
				),
				'body'    => $payload,
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Intentional logging.
			error_log( 'AilabsAudit: verify connection failed (network error).' );
			update_option( 'ailabsaudit_status', 'connection_error' );
			return array(
				'success' => false,
				'message' => __( 'Connection error. Please check your settings and server connectivity.', 'ailabsaudit-tracker' ),
			);
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 200 === $code ) {
			update_option( 'ailabsaudit_status', 'connected' );
			return array(
				'success' => true,
				'message' => __( 'Connection successful.', 'ailabsaudit-tracker' ),
			);
		}

		update_option( 'ailabsaudit_status', 'connection_error' );
		return array(
			'success' => false,
			'message' => sprintf(
				/* translators: %d: HTTP status code */
				__( 'API returned HTTP %d.', 'ailabsaudit-tracker' ),
				$code
			),
		);
	}
}
