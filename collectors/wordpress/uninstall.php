<?php
/**
 * Uninstall handler — removes all plugin data.
 *
 * @package Ailabsaudit_Tracker
 * @license GPL-2.0-or-later
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Delete all ailabsaudit options.
delete_option( 'ailabsaudit_api_key' );
delete_option( 'ailabsaudit_hmac_secret' );
delete_option( 'ailabsaudit_client_id' );
delete_option( 'ailabsaudit_api_url' );
delete_option( 'ailabsaudit_status' );

// Delete transients.
delete_transient( 'ailabsaudit_event_buffer' );
delete_transient( 'ailabsaudit_bot_signatures' );
delete_transient( 'ailabsaudit_ai_referrers' );
delete_transient( 'ailabsaudit_bot_signatures_etag' );
delete_transient( 'ailabsaudit_ai_referrers_etag' );
delete_transient( 'ailabsaudit_retry_count' );

// Clear scheduled cron events.
wp_clear_scheduled_hook( 'ailabsaudit_flush_buffer' );
wp_clear_scheduled_hook( 'ailabsaudit_refresh_signatures' );
