<?php
/**
 * Signature cache — stores bot signatures and AI referrer lists via transients.
 *
 * @package Ailabsaudit_Tracker
 * @license GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Manages cached bot signature and AI referrer lists with API refresh.
 */
class Ailabsaudit_Cache {

	const BOT_TRANSIENT      = 'ailabsaudit_bot_signatures';
	const REFERRER_TRANSIENT = 'ailabsaudit_ai_referrers';
	const BOT_ETAG           = 'ailabsaudit_bot_signatures_etag';
	const REFERRER_ETAG      = 'ailabsaudit_ai_referrers_etag';
	const TTL                = 86400; // 24 hours.

	/**
	 * Get bot signatures list.
	 *
	 * @return string[]
	 */
	public static function get_bot_signatures() {
		$cached = get_transient( self::BOT_TRANSIENT );
		if ( is_array( $cached ) && ! empty( $cached ) ) {
			return $cached;
		}

		$refreshed = self::refresh_bot_signatures();
		if ( false !== $refreshed ) {
			$cached = get_transient( self::BOT_TRANSIENT );
			if ( is_array( $cached ) && ! empty( $cached ) ) {
				return $cached;
			}
		}

		return self::get_default_bot_signatures();
	}

	/**
	 * Get AI referrer domains list.
	 *
	 * @return string[]
	 */
	public static function get_ai_referrers() {
		$cached = get_transient( self::REFERRER_TRANSIENT );
		if ( is_array( $cached ) && ! empty( $cached ) ) {
			return $cached;
		}

		$refreshed = self::refresh_ai_referrers();
		if ( false !== $refreshed ) {
			$cached = get_transient( self::REFERRER_TRANSIENT );
			if ( is_array( $cached ) && ! empty( $cached ) ) {
				return $cached;
			}
		}

		return self::get_default_ai_referrers();
	}

	/**
	 * Refresh bot signatures from the API.
	 *
	 * @return bool True on success, false on failure.
	 */
	public static function refresh_bot_signatures() {
		$api_key = get_option( 'ailabsaudit_api_key', '' );
		$secret  = get_option( 'ailabsaudit_hmac_secret', '' );
		$api_url = get_option( 'ailabsaudit_api_url', AILABSAUDIT_API_URL );

		if ( '' === $api_key || '' === $secret ) {
			return false;
		}

		$path      = '/api/v1/bot-signatures';
		$timestamp = (string) time();
		$signature = Ailabsaudit_Sender::sign( $timestamp, 'GET', $path, '', $secret );

		$headers = array(
			'X-API-Key'   => $api_key,
			'X-Timestamp' => $timestamp,
			'X-Signature' => $signature,
			'User-Agent'  => 'AilabsauditTracker/' . AILABSAUDIT_VERSION,
		);

		$etag = get_transient( self::BOT_ETAG );
		if ( ! empty( $etag ) ) {
			$headers['If-None-Match'] = $etag;
		}

		$response = wp_remote_get(
			rtrim( $api_url, '/' ) . '/bot-signatures',
			array(
				'timeout' => 15,
				'headers' => $headers,
			)
		);

		if ( is_wp_error( $response ) ) {
			return false;
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 304 === $code ) {
			// Not modified — extend TTL.
			$cached = get_transient( self::BOT_TRANSIENT );
			if ( is_array( $cached ) ) {
				set_transient( self::BOT_TRANSIENT, $cached, self::TTL );
			}
			return true;
		}

		if ( 200 === $code ) {
			$body = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( is_array( $body ) && isset( $body['signatures'] ) && is_array( $body['signatures'] ) ) {
				$patterns = array_filter(
					array_column( $body['signatures'], 'pattern' ),
					function ( $p ) {
						return is_string( $p ) && strlen( $p ) > 0 && strlen( $p ) < 256;
					}
				);
				$patterns = array_values( $patterns );
				if ( ! empty( $patterns ) ) {
					set_transient( self::BOT_TRANSIENT, $patterns, self::TTL );
					$new_etag = wp_remote_retrieve_header( $response, 'etag' );
					if ( '' !== $new_etag ) {
						set_transient( self::BOT_ETAG, $new_etag, self::TTL );
					}
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Refresh AI referrer domains from the API.
	 *
	 * @return bool True on success, false on failure.
	 */
	public static function refresh_ai_referrers() {
		$api_key = get_option( 'ailabsaudit_api_key', '' );
		$secret  = get_option( 'ailabsaudit_hmac_secret', '' );
		$api_url = get_option( 'ailabsaudit_api_url', AILABSAUDIT_API_URL );

		if ( '' === $api_key || '' === $secret ) {
			return false;
		}

		$path      = '/api/v1/ai-referrers';
		$timestamp = (string) time();
		$signature = Ailabsaudit_Sender::sign( $timestamp, 'GET', $path, '', $secret );

		$headers = array(
			'X-API-Key'   => $api_key,
			'X-Timestamp' => $timestamp,
			'X-Signature' => $signature,
			'User-Agent'  => 'AilabsauditTracker/' . AILABSAUDIT_VERSION,
		);

		$etag = get_transient( self::REFERRER_ETAG );
		if ( ! empty( $etag ) ) {
			$headers['If-None-Match'] = $etag;
		}

		$response = wp_remote_get(
			rtrim( $api_url, '/' ) . '/ai-referrers',
			array(
				'timeout' => 15,
				'headers' => $headers,
			)
		);

		if ( is_wp_error( $response ) ) {
			return false;
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 304 === $code ) {
			$cached = get_transient( self::REFERRER_TRANSIENT );
			if ( is_array( $cached ) ) {
				set_transient( self::REFERRER_TRANSIENT, $cached, self::TTL );
			}
			return true;
		}

		if ( 200 === $code ) {
			$body = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( is_array( $body ) && isset( $body['referrers'] ) && is_array( $body['referrers'] ) ) {
				$domains = array_filter(
					array_column( $body['referrers'], 'domain' ),
					function ( $d ) {
						return is_string( $d ) && strlen( $d ) > 0 && strlen( $d ) < 256;
					}
				);
				$domains = array_values( $domains );
				if ( ! empty( $domains ) ) {
					set_transient( self::REFERRER_TRANSIENT, $domains, self::TTL );
					$new_etag = wp_remote_retrieve_header( $response, 'etag' );
					if ( '' !== $new_etag ) {
						set_transient( self::REFERRER_ETAG, $new_etag, self::TTL );
					}
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Default hardcoded bot signatures.
	 *
	 * @return string[]
	 */
	public static function get_default_bot_signatures() {
		return array(
			'GPTBot',            // OpenAI.
			'ChatGPT-User',     // OpenAI.
			'OAI-SearchBot',    // OpenAI.
			'Operator',         // OpenAI.
			'ClaudeBot',        // Anthropic.
			'Claude-Web',       // Anthropic.
			'Claude-SearchBot', // Anthropic.
			'anthropic-ai',     // Anthropic.
			'Google-Extended',       // Google.
			'GoogleOther',           // Google.
			'GoogleOther-Image',     // Google.
			'GoogleOther-Video',     // Google.
			'Google-CloudVertexBot', // Google.
			'Googlebot',             // Google.
			'PerplexityBot',         // Perplexity.
			'meta-externalagent',    // Meta.
			'meta-externalfetcher',  // Meta.
			'FacebookBot',           // Meta.
			'facebookexternalhit',   // Meta.
			'bingbot',          // Microsoft.
			'CopilotBot',       // Microsoft.
			'MicrosoftPreview', // Microsoft.
			'Applebot',          // Apple.
			'Applebot-Extended', // Apple.
			'Bytespider', // ByteDance.
			'ByteDance',  // ByteDance.
			'Amazonbot',     // Amazon.
			'DuckAssistBot', // DuckDuckGo.
			'CCBot',         // Common Crawl.
			'Diffbot',       // Diffbot.
			'Seekr',         // Seekr.
			'cohere-ai',     // Cohere.
			'YouBot',        // You.com.
			'PetalBot',      // Aspiegel.
			'Timpibot',      // Timpi.
			'ImagesiftBot',  // Imagesift.
			'omgili',      // Omgili.
			'Webzio',      // Webz.io.
			'Nicecrawler', // Nicecrawler.
			'ICC-Crawler', // ICC.
			'Scrapy',          // Scrapy.
			'newspaper',       // Newspaper.
			'AhrefsBot',      // Ahrefs.
			'SemrushBot',     // Semrush.
			'MJ12bot',        // Majestic.
			'DotBot',         // Moz.
			'Rogerbot',       // Moz.
			'Screaming Frog', // Screaming Frog.
			'ISSCyberRiskCrawler', // ISS.
			'Sidetrade',          // Sidetrade.
			'Owler',              // Owler.
			'DeepSeekBot', // DeepSeek.
			'Mistral',     // Mistral.
			'Firecrawl',   // Firecrawl.
			'Jina',        // Jina.
		);
	}

	/**
	 * Default hardcoded AI referrer domains.
	 *
	 * @return string[]
	 */
	public static function get_default_ai_referrers() {
		return array(
			'chatgpt.com',
			'chat.openai.com',
			'perplexity.ai',
			'claude.ai',
			'gemini.google.com',
			'labs.google',
			'copilot.microsoft.com',
			'poe.com',
			'you.com',
			'phind.com',
			'deepseek.com',
			'chat.deepseek.com',
			'grok.x.ai',
			'meta.ai',
			'chat.mistral.ai',
			'kagi.com',
			'andi.com',
			'iask.ai',
			'brave.com',
			'character.ai',
		);
	}
}
