<?php
/**
 * Admin settings page for AI Labs Audit Tracker.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AiLabsAudit_Settings {

	private const OPTION_KEY = 'ailabsaudit_tracker_settings';
	private const PAGE_SLUG  = 'ailabsaudit-tracker';

	/**
	 * Register hooks.
	 */
	public function init(): void {
		add_action( 'admin_menu', array( $this, 'add_menu_page' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( AILABSAUDIT_TRACKER_FILE ), array( $this, 'add_settings_link' ) );
	}

	/**
	 * Get the saved options with defaults.
	 *
	 * @return array
	 */
	public function get_options(): array {
		$defaults = array(
			'tracker_id'   => '',
			'api_secret'   => '',
			'api_url'      => 'https://api.ailabsaudit.com/v1/collect',
			'track_admin'  => 'no',
			'anonymize_ip' => 'yes',
		);

		$options = get_option( self::OPTION_KEY, array() );
		return wp_parse_args( $options, $defaults );
	}

	/**
	 * Add the settings page under Settings menu.
	 */
	public function add_menu_page(): void {
		add_options_page(
			__( 'AI Labs Audit Tracker', 'ailabsaudit-tracker' ),
			__( 'AI Labs Audit Tracker', 'ailabsaudit-tracker' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Register settings, sections, and fields.
	 */
	public function register_settings(): void {
		register_setting( self::PAGE_SLUG, self::OPTION_KEY, array(
			'sanitize_callback' => array( $this, 'sanitize_options' ),
		) );

		add_settings_section(
			'ailabsaudit_main',
			__( 'Tracker Configuration', 'ailabsaudit-tracker' ),
			'__return_null',
			self::PAGE_SLUG
		);

		$this->add_field( 'tracker_id', __( 'Tracker ID', 'ailabsaudit-tracker' ), 'text', __( 'e.g. TRK-00001', 'ailabsaudit-tracker' ) );
		$this->add_field( 'api_secret', __( 'API Secret', 'ailabsaudit-tracker' ), 'password' );
		$this->add_field( 'api_url', __( 'API Endpoint', 'ailabsaudit-tracker' ), 'url' );
		$this->add_field( 'track_admin', __( 'Track admin users', 'ailabsaudit-tracker' ), 'checkbox' );
		$this->add_field( 'anonymize_ip', __( 'Anonymize IP', 'ailabsaudit-tracker' ), 'checkbox' );
	}

	/**
	 * Helper to register a settings field.
	 */
	private function add_field( string $id, string $title, string $type, string $placeholder = '' ): void {
		add_settings_field(
			$id,
			$title,
			function () use ( $id, $type, $placeholder ) {
				$opts  = $this->get_options();
				$value = $opts[ $id ] ?? '';
				$name  = self::OPTION_KEY . '[' . $id . ']';

				if ( 'checkbox' === $type ) {
					printf(
						'<input type="checkbox" id="%1$s" name="%2$s" value="yes" %3$s />',
						esc_attr( $id ),
						esc_attr( $name ),
						checked( $value, 'yes', false )
					);
				} else {
					printf(
						'<input type="%1$s" id="%2$s" name="%3$s" value="%4$s" class="regular-text" placeholder="%5$s" />',
						esc_attr( $type ),
						esc_attr( $id ),
						esc_attr( $name ),
						esc_attr( $value ),
						esc_attr( $placeholder )
					);
				}
			},
			self::PAGE_SLUG,
			'ailabsaudit_main'
		);
	}

	/**
	 * Sanitize options on save.
	 *
	 * @param array $input Raw input.
	 * @return array Sanitized output.
	 */
	public function sanitize_options( array $input ): array {
		return array(
			'tracker_id'   => sanitize_text_field( $input['tracker_id'] ?? '' ),
			'api_secret'   => sanitize_text_field( $input['api_secret'] ?? '' ),
			'api_url'      => esc_url_raw( $input['api_url'] ?? 'https://api.ailabsaudit.com/v1/collect' ),
			'track_admin'  => isset( $input['track_admin'] ) ? 'yes' : 'no',
			'anonymize_ip' => isset( $input['anonymize_ip'] ) ? 'yes' : 'no',
		);
	}

	/**
	 * Render the settings page.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<form method="post" action="options.php">
				<?php
				settings_fields( self::PAGE_SLUG );
				do_settings_sections( self::PAGE_SLUG );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}

	/**
	 * Add Settings link on the Plugins page.
	 *
	 * @param array $links Existing links.
	 * @return array Modified links.
	 */
	public function add_settings_link( array $links ): array {
		$url  = admin_url( 'options-general.php?page=' . self::PAGE_SLUG );
		$link = sprintf( '<a href="%s">%s</a>', esc_url( $url ), __( 'Settings', 'ailabsaudit-tracker' ) );
		array_unshift( $links, $link );
		return $links;
	}
}
