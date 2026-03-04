<?php
/**
 * Plugin Name:       AI Labs Audit Tracker
 * Plugin URI:        https://github.com/ailabssolutions/ailabsaudit-tracker
 * Description:       Lightweight tracking collector for AI Labs Audit — captures page views and events, signs payloads with HMAC-SHA256.
 * Version:           1.0.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            AI Labs Solutions
 * Author URI:        https://ailabssolutions.com
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       ailabsaudit-tracker
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AILABSAUDIT_TRACKER_VERSION', '1.0.0' );
define( 'AILABSAUDIT_TRACKER_FILE', __FILE__ );
define( 'AILABSAUDIT_TRACKER_DIR', plugin_dir_path( __FILE__ ) );
define( 'AILABSAUDIT_TRACKER_URL', plugin_dir_url( __FILE__ ) );

require_once AILABSAUDIT_TRACKER_DIR . 'includes/class-ailabsaudit-settings.php';
require_once AILABSAUDIT_TRACKER_DIR . 'includes/class-ailabsaudit-collector.php';
require_once AILABSAUDIT_TRACKER_DIR . 'includes/class-ailabsaudit-signer.php';
require_once AILABSAUDIT_TRACKER_DIR . 'includes/class-ailabsaudit-sender.php';

/**
 * Initialize the plugin.
 */
function ailabsaudit_tracker_init() {
	$settings  = new AiLabsAudit_Settings();
	$signer    = new AiLabsAudit_Signer();
	$sender    = new AiLabsAudit_Sender( $signer );
	$collector = new AiLabsAudit_Collector( $settings, $sender );

	$settings->init();
	$collector->init();
}
add_action( 'plugins_loaded', 'ailabsaudit_tracker_init' );

/**
 * Run on plugin activation.
 */
function ailabsaudit_tracker_activate() {
	$defaults = array(
		'tracker_id'   => '',
		'api_secret'   => '',
		'api_url'      => 'https://api.ailabsaudit.com/v1/collect',
		'track_admin'  => 'no',
		'anonymize_ip' => 'yes',
	);
	if ( ! get_option( 'ailabsaudit_tracker_settings' ) ) {
		add_option( 'ailabsaudit_tracker_settings', $defaults, '', false );
	}
}
register_activation_hook( __FILE__, 'ailabsaudit_tracker_activate' );

/**
 * Run on plugin deactivation.
 */
function ailabsaudit_tracker_deactivate() {
	wp_clear_scheduled_hook( 'ailabsaudit_flush_queue' );
}
register_deactivation_hook( __FILE__, 'ailabsaudit_tracker_deactivate' );
