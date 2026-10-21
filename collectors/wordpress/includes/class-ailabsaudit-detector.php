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
			$referer = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) ) : '';
			// On bufferise la sortie pour capturer taille réelle + profil de page
			// (format dominant : tableau, liste, texte) sans stocker le contenu.
			ob_start(
				function ( $html ) use ( $user_agent, $url, $referer ) {
					self::emit_bot_crawl( $user_agent, $url, $referer, $html );
					return $html;
				}
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
	 * Emit a bot_crawl event once the page has been rendered.
	 *
	 * @param string $user_agent User-agent string.
	 * @param string $url        Request URI.
	 * @param string $referer    HTTP referer (may be empty).
	 * @param string $html       Rendered HTML (not stored, only profiled).
	 */
	public static function emit_bot_crawl( $user_agent, $url, $referer, $html ) {
		$event = array(
			'type'          => 'bot_crawl',
			'user_agent'    => substr( $user_agent, 0, 500 ),
			'url'           => substr( $url, 0, 2000 ),
			'timestamp'     => gmdate( 'c' ),
			'status_code'   => function_exists( 'http_response_code' ) && http_response_code() ? http_response_code() : 200,
			'response_size' => is_string( $html ) ? strlen( $html ) : 0,
		);

		if ( '' !== $referer ) {
			$event['referer'] = substr( $referer, 0, 2000 );
		}

		$profile = self::extract_page_profile( $html );
		if ( null !== $profile ) {
			$event['page_profile'] = $profile;
		}

		Ailabsaudit_Buffer::add( $event );
	}

	/**
	 * Structural page profile (no personal data, no content stored).
	 *
	 * @param string $html HTML body.
	 * @return array|null Profile or null.
	 */
	public static function extract_page_profile( $html ) {
		if ( ! is_string( $html ) || '' === $html || false === strpos( $html, '<' ) ) {
			return null;
		}

		// Cap defensif : 256 Ko max analysés.
		$scan = substr( $html, 0, 262144 );

		$counts = array(
			'table'   => preg_match_all( '/<table\b/i', $scan ),
			'ul'      => preg_match_all( '/<ul\b/i', $scan ),
			'ol'      => preg_match_all( '/<ol\b/i', $scan ),
			'li'      => preg_match_all( '/<li\b/i', $scan ),
			'p'       => preg_match_all( '/<p\b/i', $scan ),
			'h1'      => preg_match_all( '/<h1\b/i', $scan ),
			'h2'      => preg_match_all( '/<h2\b/i', $scan ),
			'h3'      => preg_match_all( '/<h3\b/i', $scan ),
			'h4'      => preg_match_all( '/<h4\b/i', $scan ),
			'a'       => preg_match_all( '/<a\b/i', $scan ),
			'img'     => preg_match_all( '/<img\b/i', $scan ),
		);

		// Texte visible : on vire scripts/styles puis les balises.
		$text = preg_replace( '/<(script|style|noscript)\b[^>]*>.*?<\/\1>/is', ' ', $scan );
		$text = wp_strip_all_tags( (string) $text );
		$word_count = preg_match_all( '/[^\W_]{2,}/u', (string) $text );

		$title = '';
		if ( preg_match( '/<title[^>]*>(.*?)<\/title>/is', $scan, $m ) ) {
			$title = substr( trim( wp_strip_all_tags( $m[1] ) ), 0, 200 );
		}

		$has_table = $counts['table'] > 0;
		$has_list  = ( $counts['ul'] + $counts['ol'] ) > 0;

		if ( $has_table && $has_list ) {
			$dominant = 'mixed';
		} elseif ( $has_table ) {
			$dominant = 'table';
		} elseif ( $has_list && $counts['li'] >= 5 ) {
			$dominant = 'list';
		} else {
			$dominant = 'text';
		}

		return array(
			'word_count'      => (int) $word_count,
			'has_table'       => $has_table,
			'has_list'        => $has_list,
			'list_item_count' => (int) $counts['li'],
			'heading_count'   => (int) ( $counts['h1'] + $counts['h2'] + $counts['h3'] + $counts['h4'] ),
			'paragraph_count' => (int) $counts['p'],
			'link_count'      => (int) $counts['a'],
			'image_count'     => (int) $counts['img'],
			'title'           => $title,
			'format'          => $dominant,
		);
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
