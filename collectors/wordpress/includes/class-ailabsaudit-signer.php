<?php
/**
 * HMAC-SHA256 signer.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AiLabsAudit_Signer {

	/**
	 * Canonicalize a payload array into a deterministic JSON string.
	 *
	 * Keys are sorted recursively, output uses compact separators.
	 *
	 * @param array $payload The payload data.
	 * @return string Canonical JSON string.
	 */
	public function canonicalize( array $payload ): string {
		$sorted = $this->sort_recursive( $payload );
		return wp_json_encode( $sorted, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	}

	/**
	 * Compute HMAC-SHA256 signature.
	 *
	 * @param string $canonical_json The canonical JSON string.
	 * @param string $secret         The API secret.
	 * @return string Lowercase hex signature.
	 */
	public function sign( string $canonical_json, string $secret ): string {
		return hash_hmac( 'sha256', $canonical_json, $secret );
	}

	/**
	 * Build the X-Signature header value.
	 *
	 * @param string $canonical_json The canonical JSON string.
	 * @param string $secret         The API secret.
	 * @return string Header value, e.g. "sha256=abcdef...".
	 */
	public function header( string $canonical_json, string $secret ): string {
		return 'sha256=' . $this->sign( $canonical_json, $secret );
	}

	/**
	 * Recursively sort array keys.
	 *
	 * @param mixed $data Input data.
	 * @return mixed Sorted data.
	 */
	private function sort_recursive( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}

		// Check if associative array.
		if ( array_keys( $data ) !== range( 0, count( $data ) - 1 ) ) {
			ksort( $data, SORT_STRING );
		}

		foreach ( $data as $key => $value ) {
			if ( is_array( $value ) ) {
				$data[ $key ] = $this->sort_recursive( $value );
			}
		}

		return $data;
	}
}
