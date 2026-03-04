<?php
/**
 * Main collector — hooks into WordPress to capture page views and events.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AiLabsAudit_Collector {

	/**
	 * @var AiLabsAudit_Settings
	 */
	private $settings;

	/**
	 * @var AiLabsAudit_Sender
	 */
	private $sender;

	public function __construct( AiLabsAudit_Settings $settings, AiLabsAudit_Sender $sender ) {
		$this->settings = $settings;
		$this->sender   = $sender;
	}

	/**
	 * Register WordPress hooks.
	 */
	public function init(): void {
		if ( ! $this->is_configured() ) {
			return;
		}

		add_action( 'wp', array( $this, 'track_page_view' ) );
		add_action( 'wp_ajax_ailabsaudit_event', array( $this, 'handle_ajax_event' ) );
		add_action( 'wp_ajax_nopriv_ailabsaudit_event', array( $this, 'handle_ajax_event' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
	}

	/**
	 * Check if the plugin is properly configured.
	 */
	private function is_configured(): bool {
		$opts = $this->settings->get_options();
		return ! empty( $opts['tracker_id'] ) && ! empty( $opts['api_secret'] );
	}

	/**
	 * Track a page view on the frontend.
	 */
	public function track_page_view(): void {
		if ( is_admin() ) {
			return;
		}

		$opts = $this->settings->get_options();
		if ( 'no' === $opts['track_admin'] && current_user_can( 'manage_options' ) ) {
			return;
		}

		if ( wp_doing_cron() || wp_doing_ajax() || defined( 'REST_REQUEST' ) ) {
			return;
		}

		$payload = $this->build_payload( 'page_view' );
		$this->sender->send( $payload, $opts['api_url'], $opts['api_secret'] );
	}

	/**
	 * Handle AJAX custom event from the frontend JS.
	 */
	public function handle_ajax_event(): void {
		check_ajax_referer( 'ailabsaudit_tracker_nonce', 'nonce' );

		$event_name = isset( $_POST['event_name'] )
			? sanitize_text_field( wp_unslash( $_POST['event_name'] ) )
			: '';

		if ( empty( $event_name ) ) {
			wp_send_json_error( 'Missing event name', 400 );
		}

		$meta = array();
		if ( isset( $_POST['meta'] ) && is_array( $_POST['meta'] ) ) {
			$meta = array_map( 'sanitize_text_field', wp_unslash( $_POST['meta'] ) );
		}

		$url = isset( $_POST['url'] )
			? esc_url_raw( wp_unslash( $_POST['url'] ) )
			: '';

		$payload = $this->build_payload( $event_name, $url, $meta );
		$opts    = $this->settings->get_options();
		$result  = $this->sender->send( $payload, $opts['api_url'], $opts['api_secret'] );

		if ( $result['success'] ) {
			wp_send_json_success();
		} else {
			wp_send_json_error( 'Failed to send event', 500 );
		}
	}

	/**
	 * Enqueue the frontend tracking script.
	 */
	public function enqueue_scripts(): void {
		if ( is_admin() ) {
			return;
		}

		wp_enqueue_script(
			'ailabsaudit-tracker',
			AILABSAUDIT_TRACKER_URL . 'assets/tracker.js',
			array(),
			AILABSAUDIT_TRACKER_VERSION,
			true
		);

		wp_localize_script( 'ailabsaudit-tracker', 'ailabsauditTracker', array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce'   => wp_create_nonce( 'ailabsaudit_tracker_nonce' ),
		) );
	}

	/**
	 * Build a tracking payload.
	 *
	 * @param string $event Event type.
	 * @param string $url   Optional URL override.
	 * @param array  $meta  Optional metadata.
	 * @return array
	 */
	private function build_payload( string $event, string $url = '', array $meta = array() ): array {
		$opts = $this->settings->get_options();

		if ( empty( $url ) ) {
			$url = home_url( add_query_arg( array() ) );
		}

		$payload = array(
			'event'      => $event,
			'timestamp'  => gmdate( 'Y-m-d\TH:i:s\Z' ),
			'tracker_id' => $opts['tracker_id'],
			'url'        => $url,
		);

		$referrer = wp_get_referer();
		if ( $referrer ) {
			$payload['referrer'] = $referrer;
		}

		if ( isset( $_SERVER['HTTP_USER_AGENT'] ) ) {
			$payload['user_agent'] = sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) );
		}

		$ip = $this->get_client_ip();
		if ( $ip ) {
			if ( 'yes' === $opts['anonymize_ip'] ) {
				$ip = $this->anonymize_ip( $ip );
			}
			$payload['ip'] = $ip;
		}

		if ( ! empty( $meta ) ) {
			$payload['meta'] = $meta;
		}

		return $payload;
	}

	/**
	 * Get the client IP address.
	 */
	private function get_client_ip(): string {
		$headers = array(
			'HTTP_CF_CONNECTING_IP',
			'HTTP_X_FORWARDED_FOR',
			'HTTP_X_REAL_IP',
			'REMOTE_ADDR',
		);

		foreach ( $headers as $header ) {
			if ( ! empty( $_SERVER[ $header ] ) ) {
				$ip = sanitize_text_field( wp_unslash( $_SERVER[ $header ] ) );
				// X-Forwarded-For can contain multiple IPs, take the first.
				if ( strpos( $ip, ',' ) !== false ) {
					$ip = trim( explode( ',', $ip )[0] );
				}
				if ( filter_var( $ip, FILTER_VALIDATE_IP ) ) {
					return $ip;
				}
			}
		}

		return '';
	}

	/**
	 * Anonymize an IP by zeroing the last octet (IPv4) or last 80 bits (IPv6).
	 */
	private function anonymize_ip( string $ip ): string {
		if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 ) ) {
			return preg_replace( '/\.\d+$/', '.0', $ip );
		}

		if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 ) ) {
			return inet_ntop( substr( inet_pton( $ip ), 0, 6 ) . str_repeat( "\0", 10 ) );
		}

		return $ip;
	}
}
