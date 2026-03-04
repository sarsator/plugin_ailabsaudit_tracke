<?php
/**
 * AI bot and AI referrer detector.
 *
 * @package Ailabsaudit_Tracker
 * @license GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Detects AI bot crawls and AI referral visits on each request.
 */
class Ailabsaudit_Detector {

	/**
	 * Run detection on the current request.
	 */
	public static function detect() {
		// Skip admin, AJAX, cron, preview, and REST requests.
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || is_preview() ) {
			return;
		}

		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			return;
		}

		$user_agent = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';

		if ( '' === $user_agent ) {
			return;
		}

		$url = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/';

		// 1. Check for AI bot crawlers.
		$bot_signatures = Ailabsaudit_Cache::get_bot_signatures();
		$matched_bot    = self::match_bot( $user_agent, $bot_signatures );

		if ( null !== $matched_bot ) {
			Ailabsaudit_Buffer::add(
				array(
					'type'          => 'bot_crawl',
					'user_agent'    => substr( $user_agent, 0, 500 ),
					'url'           => substr( $url, 0, 2000 ),
					'timestamp'     => gmdate( 'c' ),
					'status_code'   => http_response_code() ? http_response_code() : 200,
					'response_size' => 0,
				)
			);
			return;
		}

		// 2. Check for AI referrers.
		$referer = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) ) : '';

		if ( '' === $referer ) {
			return;
		}

		$hostname = wp_parse_url( $referer, PHP_URL_HOST );

		if ( empty( $hostname ) ) {
			return;
		}

		$ai_referrers   = Ailabsaudit_Cache::get_ai_referrers();
		$matched_domain = self::match_referrer( $hostname, $ai_referrers );

		if ( null !== $matched_domain ) {
			Ailabsaudit_Buffer::add(
				array(
					'type'            => 'ai_referral',
					'referrer_domain' => $matched_domain,
					'url'             => substr( $url, 0, 2000 ),
					'timestamp'       => gmdate( 'c' ),
				)
			);
		}
	}

	/**
	 * Match user-agent against bot signatures.
	 *
	 * @param string   $user_agent     The user-agent string.
	 * @param string[] $bot_signatures List of bot signature patterns.
	 * @return string|null Matched pattern or null.
	 */
	public static function match_bot( $user_agent, $bot_signatures ) {
		foreach ( $bot_signatures as $pattern ) {
			if ( false !== stripos( $user_agent, $pattern ) ) {
				return $pattern;
			}
		}
		return null;
	}

	/**
	 * Match hostname against AI referrer domains (PHP 7.4 compatible).
	 *
	 * @param string   $hostname     The hostname to check.
	 * @param string[] $ai_referrers List of AI referrer domains.
	 * @return string|null Matched domain or null.
	 */
	public static function match_referrer( $hostname, $ai_referrers ) {
		$hostname = strtolower( $hostname );
		foreach ( $ai_referrers as $domain ) {
			$domain_lower = strtolower( $domain );
			if ( $hostname === $domain_lower || substr( $hostname, -strlen( '.' . $domain_lower ) ) === '.' . $domain_lower ) {
				return $domain;
			}
		}
		return null;
	}
}
