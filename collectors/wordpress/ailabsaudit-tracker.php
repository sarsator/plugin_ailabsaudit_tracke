<?php
/**
 * Plugin Name: AI Labs Audit Tracker
 * Plugin URI: https://github.com/ailabsaudit/tracker
 * Description: Track AI bot crawls and AI-generated referral traffic on your website.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Author: AI Labs Audit
 * Author URI: https://github.com/ailabsaudit
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: ailabsaudit-tracker
 *
 * @package Ailabsaudit_Tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AILABSAUDIT_VERSION', '1.0.0' );
define( 'AILABSAUDIT_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'AILABSAUDIT_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
// Default API base URL — override via Settings > AI Labs Audit > API URL.
define( 'AILABSAUDIT_API_URL', 'https://YOUR_API_DOMAIN/api/v1' );

require_once AILABSAUDIT_PLUGIN_DIR . 'includes/class-ailabsaudit-cache.php';
require_once AILABSAUDIT_PLUGIN_DIR . 'includes/class-ailabsaudit-detector.php';
require_once AILABSAUDIT_PLUGIN_DIR . 'includes/class-ailabsaudit-buffer.php';
require_once AILABSAUDIT_PLUGIN_DIR . 'includes/class-ailabsaudit-sender.php';

if ( is_admin() ) {
	require_once AILABSAUDIT_PLUGIN_DIR . 'admin/class-ailabsaudit-settings.php';
}

/**
 * Main plugin class — singleton.
 *
 * Bootstraps cron schedules, detection hooks, and admin settings.
 */
final class Ailabsaudit_Tracker {

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static $instance = null;

	/**
	 * Get singleton instance.
	 *
	 * @return self
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Wire up actions.
	 */
	private function __construct() {
		add_action( 'init', array( $this, 'register_cron' ) );
		add_action( 'template_redirect', array( 'Ailabsaudit_Detector', 'detect' ), 1 );
		add_action( 'ailabsaudit_flush_buffer', array( 'Ailabsaudit_Sender', 'flush' ) );
		add_action( 'ailabsaudit_refresh_signatures', array( $this, 'refresh_signatures' ) );

		if ( is_admin() ) {
			new Ailabsaudit_Settings();
		}
	}

	/**
	 * Refresh bot signatures and AI referrers from API.
	 */
	public function refresh_signatures() {
		Ailabsaudit_Cache::refresh_bot_signatures();
		Ailabsaudit_Cache::refresh_ai_referrers();
	}

	/**
	 * Register custom cron schedules and schedule events.
	 */
	public function register_cron() {
		add_filter(
			'cron_schedules',
			function ( $schedules ) {
				if ( ! isset( $schedules['ailabsaudit_five_minutes'] ) ) {
					$schedules['ailabsaudit_five_minutes'] = array(
						'interval' => 300,
						'display'  => __( 'Every 5 Minutes', 'ailabsaudit-tracker' ),
					);
				}
				return $schedules;
			}
		);

		if ( ! wp_next_scheduled( 'ailabsaudit_flush_buffer' ) ) {
			wp_schedule_event(
				time(),
				'ailabsaudit_five_minutes',
				'ailabsaudit_flush_buffer'
			);
		}

		if ( ! wp_next_scheduled( 'ailabsaudit_refresh_signatures' ) ) {
			wp_schedule_event( time(), 'daily', 'ailabsaudit_refresh_signatures' );
		}
	}

	/**
	 * Activation hook.
	 */
	public static function activate() {
		if ( false === get_option( 'ailabsaudit_api_key' ) ) {
			add_option( 'ailabsaudit_api_key', '' );
		}
		if ( false === get_option( 'ailabsaudit_hmac_secret' ) ) {
			add_option( 'ailabsaudit_hmac_secret', '' );
		}
		if ( false === get_option( 'ailabsaudit_client_id' ) ) {
			add_option( 'ailabsaudit_client_id', '' );
		}
		if ( false === get_option( 'ailabsaudit_api_url' ) ) {
			add_option( 'ailabsaudit_api_url', AILABSAUDIT_API_URL );
		}
		if ( false === get_option( 'ailabsaudit_status' ) ) {
			add_option( 'ailabsaudit_status', 'not_configured' );
		}

		// Register the custom schedule before scheduling events.
		add_filter(
			'cron_schedules',
			function ( $schedules ) {
				if ( ! isset( $schedules['ailabsaudit_five_minutes'] ) ) {
					$schedules['ailabsaudit_five_minutes'] = array(
						'interval' => 300,
						'display'  => 'Every 5 Minutes',
					);
				}
				return $schedules;
			}
		);

		if ( ! wp_next_scheduled( 'ailabsaudit_flush_buffer' ) ) {
			wp_schedule_event(
				time(),
				'ailabsaudit_five_minutes',
				'ailabsaudit_flush_buffer'
			);
		}
		if ( ! wp_next_scheduled( 'ailabsaudit_refresh_signatures' ) ) {
			wp_schedule_event( time(), 'daily', 'ailabsaudit_refresh_signatures' );
		}
	}

	/**
	 * Deactivation hook.
	 */
	public static function deactivate() {
		wp_clear_scheduled_hook( 'ailabsaudit_flush_buffer' );
		wp_clear_scheduled_hook( 'ailabsaudit_refresh_signatures' );

		Ailabsaudit_Sender::flush();
	}
}

register_activation_hook( __FILE__, array( 'Ailabsaudit_Tracker', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Ailabsaudit_Tracker', 'deactivate' ) );

add_action( 'plugins_loaded', array( 'Ailabsaudit_Tracker', 'instance' ), 1 );
