<?php
/**
 * Admin settings page.
 *
 * @package Ailabsaudit_Tracker
 * @license GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Ailabsaudit_Settings {

	const PAGE_SLUG = 'ailabsaudit-tracker';

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'wp_ajax_ailabsaudit_test_connection', array( $this, 'ajax_test_connection' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( AILABSAUDIT_PLUGIN_DIR . 'ailabsaudit-tracker.php' ), array( $this, 'add_settings_link' ) );
	}

	/**
	 * Add settings page under Settings menu.
	 */
	public function add_menu() {
		$hook = add_options_page(
			__( 'AI Labs Audit Tracker', 'ailabsaudit-tracker' ),
			__( 'AI Labs Audit', 'ailabsaudit-tracker' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
		add_action( 'admin_print_styles-' . $hook, array( $this, 'enqueue_styles' ) );
	}

	/**
	 * Enqueue admin CSS only on plugin page.
	 */
	public function enqueue_styles() {
		wp_enqueue_style(
			'ailabsaudit-admin',
			AILABSAUDIT_PLUGIN_URL . 'admin/assets/admin.css',
			array(),
			AILABSAUDIT_VERSION
		);
	}

	/**
	 * Register individual settings fields.
	 */
	public function register_settings() {
		register_setting( self::PAGE_SLUG, 'ailabsaudit_api_key', array(
			'sanitize_callback' => 'sanitize_text_field',
		) );
		register_setting( self::PAGE_SLUG, 'ailabsaudit_hmac_secret', array(
			'sanitize_callback' => 'sanitize_text_field',
		) );
		register_setting( self::PAGE_SLUG, 'ailabsaudit_client_id', array(
			'sanitize_callback' => 'sanitize_text_field',
		) );
		register_setting( self::PAGE_SLUG, 'ailabsaudit_api_url', array(
			'sanitize_callback' => array( $this, 'sanitize_api_url' ),
		) );

		add_settings_section(
			'ailabsaudit_main',
			__( 'API Configuration', 'ailabsaudit-tracker' ),
			'__return_false',
			self::PAGE_SLUG
		);

		$fields = array(
			'ailabsaudit_api_key'     => __( 'API Key', 'ailabsaudit-tracker' ),
			'ailabsaudit_hmac_secret' => __( 'HMAC Secret', 'ailabsaudit-tracker' ),
			'ailabsaudit_client_id'   => __( 'Client ID', 'ailabsaudit-tracker' ),
			'ailabsaudit_api_url'     => __( 'API URL', 'ailabsaudit-tracker' ),
		);

		foreach ( $fields as $id => $label ) {
			add_settings_field(
				$id,
				$label,
				array( $this, 'render_field' ),
				self::PAGE_SLUG,
				'ailabsaudit_main',
				array( 'id' => $id, 'label' => $label )
			);
		}
	}

	/**
	 * Render a single settings field.
	 *
	 * @param array $args Field arguments.
	 */
	public function render_field( $args ) {
		$id    = $args['id'];
		$value = get_option( $id, '' );

		if ( 'ailabsaudit_api_url' === $id && '' === $value ) {
			$value = AILABSAUDIT_API_URL;
		}

		$type = 'ailabsaudit_hmac_secret' === $id ? 'password' : 'text';

		printf(
			'<input type="%s" id="%s" name="%s" value="%s" class="regular-text" autocomplete="off" />',
			esc_attr( $type ),
			esc_attr( $id ),
			esc_attr( $id ),
			esc_attr( $value )
		);

		if ( 'ailabsaudit_hmac_secret' === $id ) {
			echo ' <button type="button" class="button ailabsaudit-toggle-secret">' . esc_html__( 'Show', 'ailabsaudit-tracker' ) . '</button>';
		}
	}

	/**
	 * Render the settings page.
	 */
	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$status     = get_option( 'ailabsaudit_status', 'not_configured' );
		$configured = '' !== get_option( 'ailabsaudit_api_key', '' ) && '' !== get_option( 'ailabsaudit_hmac_secret', '' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'AI Labs Audit Tracker', 'ailabsaudit-tracker' ); ?></h1>

			<div class="ailabsaudit-status">
				<?php if ( 'connected' === $status ) : ?>
					<span class="ailabsaudit-badge ailabsaudit-badge--green"><?php esc_html_e( 'Connected', 'ailabsaudit-tracker' ); ?></span>
				<?php elseif ( $configured ) : ?>
					<span class="ailabsaudit-badge ailabsaudit-badge--orange"><?php esc_html_e( 'Configured', 'ailabsaudit-tracker' ); ?></span>
				<?php else : ?>
					<span class="ailabsaudit-badge ailabsaudit-badge--red"><?php esc_html_e( 'Not Configured', 'ailabsaudit-tracker' ); ?></span>
				<?php endif; ?>
				<span class="ailabsaudit-version"><?php echo esc_html( 'v' . AILABSAUDIT_VERSION ); ?></span>
			</div>

			<form method="post" action="options.php">
				<?php
				settings_fields( self::PAGE_SLUG );
				do_settings_sections( self::PAGE_SLUG );
				submit_button();
				?>
			</form>

			<hr />

			<h2><?php esc_html_e( 'Connection Test', 'ailabsaudit-tracker' ); ?></h2>
			<p>
				<button type="button" id="ailabsaudit-test-btn" class="button button-secondary" <?php disabled( ! $configured ); ?>>
					<?php esc_html_e( 'Test Connection', 'ailabsaudit-tracker' ); ?>
				</button>
				<span id="ailabsaudit-test-result"></span>
			</p>
		</div>

		<script>
		(function() {
			var btn = document.getElementById('ailabsaudit-test-btn');
			var result = document.getElementById('ailabsaudit-test-result');
			if (!btn) return;

			btn.addEventListener('click', function() {
				btn.disabled = true;
				result.textContent = '<?php echo esc_js( __( 'Testing...', 'ailabsaudit-tracker' ) ); ?>';
				result.className = '';

				var xhr = new XMLHttpRequest();
				xhr.open('POST', '<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>');
				xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
				xhr.onload = function() {
					btn.disabled = false;
					try {
						var data = JSON.parse(xhr.responseText);
						result.textContent = data.data ? data.data.message : 'Unknown error';
						result.className = data.success ? 'ailabsaudit-badge ailabsaudit-badge--green' : 'ailabsaudit-badge ailabsaudit-badge--red';
					} catch(e) {
						result.textContent = 'Error';
						result.className = 'ailabsaudit-badge ailabsaudit-badge--red';
					}
				};
				xhr.onerror = function() {
					btn.disabled = false;
					result.textContent = 'Network error';
					result.className = 'ailabsaudit-badge ailabsaudit-badge--red';
				};
				xhr.send('action=ailabsaudit_test_connection&_wpnonce=<?php echo esc_js( wp_create_nonce( 'ailabsaudit_test_connection' ) ); ?>');
			});

			// Toggle secret visibility.
			document.querySelectorAll('.ailabsaudit-toggle-secret').forEach(function(toggle) {
				toggle.addEventListener('click', function() {
					var input = this.previousElementSibling;
					if (input.type === 'password') {
						input.type = 'text';
						this.textContent = '<?php echo esc_js( __( 'Hide', 'ailabsaudit-tracker' ) ); ?>';
					} else {
						input.type = 'password';
						this.textContent = '<?php echo esc_js( __( 'Show', 'ailabsaudit-tracker' ) ); ?>';
					}
				});
			});
		})();
		</script>
		<?php
	}

	/**
	 * Handle AJAX test connection request.
	 */
	public function ajax_test_connection() {
		check_ajax_referer( 'ailabsaudit_test_connection', '_wpnonce', true );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'ailabsaudit-tracker' ) ) );
		}

		// Rate limit: 1 test per 30 seconds.
		$transient_key = 'ailabsaudit_test_rate_' . get_current_user_id();
		if ( false !== get_transient( $transient_key ) ) {
			wp_send_json_error( array( 'message' => __( 'Please wait before testing again.', 'ailabsaudit-tracker' ) ) );
		}
		set_transient( $transient_key, 1, 30 );

		$result = Ailabsaudit_Sender::verify_connection();

		if ( $result['success'] ) {
			wp_send_json_success( $result );
		} else {
			wp_send_json_error( $result );
		}
	}

	/**
	 * Sanitize the API URL — must be HTTPS, no private/reserved IPs.
	 *
	 * @param string $url Raw URL input.
	 * @return string Sanitized URL or default.
	 */
	public function sanitize_api_url( $url ) {
		$url    = esc_url_raw( $url );
		$parsed = wp_parse_url( $url );

		if ( empty( $parsed['scheme'] ) || 'https' !== $parsed['scheme'] ) {
			add_settings_error( 'ailabsaudit_api_url', 'invalid_scheme', __( 'API URL must use HTTPS.', 'ailabsaudit-tracker' ) );
			return AILABSAUDIT_API_URL;
		}

		$host = isset( $parsed['host'] ) ? $parsed['host'] : '';
		if ( empty( $host ) ) {
			return AILABSAUDIT_API_URL;
		}

		// Block private/reserved IPs (SSRF protection).
		$ip = gethostbyname( $host );
		if ( $ip !== $host && false === filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
			add_settings_error( 'ailabsaudit_api_url', 'private_ip', __( 'API URL must not point to a private or reserved IP.', 'ailabsaudit-tracker' ) );
			return AILABSAUDIT_API_URL;
		}

		return $url;
	}

	/**
	 * Add Settings link on Plugins page.
	 *
	 * @param array $links Existing links.
	 * @return array
	 */
	public function add_settings_link( $links ) {
		$url  = admin_url( 'options-general.php?page=' . self::PAGE_SLUG );
		$link = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'ailabsaudit-tracker' ) . '</a>';
		array_unshift( $links, $link );
		return $links;
	}
}
