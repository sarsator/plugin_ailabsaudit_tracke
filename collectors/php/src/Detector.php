<?php

/**
 * AI bot and AI referrer detector for generic PHP.
 *
 * @license MIT
 */

declare(strict_types=1);

namespace AilabsAudit\Tracker;

class Detector
{
    /**
     * Match user-agent against bot signatures (case-insensitive).
     *
     * @param string   $userAgent
     * @param string[] $botSignatures
     * @return string|null Matched pattern or null.
     */
    public static function matchBot(string $userAgent, array $botSignatures): ?string
    {
        if ($userAgent === '') {
            return null;
        }
        foreach ($botSignatures as $pattern) {
            if (stripos($userAgent, $pattern) !== false) {
                return $pattern;
            }
        }
        return null;
    }

    /**
     * Match hostname against AI referrer domains (case-insensitive).
     *
     * @param string   $hostname
     * @param string[] $aiReferrers
     * @return string|null Matched domain or null.
     */
    public static function matchReferrer(string $hostname, array $aiReferrers): ?string
    {
        if ($hostname === '') {
            return null;
        }
        $hostLower = strtolower($hostname);
        foreach ($aiReferrers as $domain) {
            $domainLower = strtolower($domain);
            if ($hostLower === $domainLower || substr($hostLower, -strlen('.' . $domainLower)) === '.' . $domainLower) {
                return $domain;
            }
        }
        return null;
    }

    /**
     * Detect an event from the current request.
     *
     * @param string[] $botSignatures
     * @param string[] $aiReferrers
     * @return array|null Event array or null.
     */
    public static function detect(array $botSignatures, array $aiReferrers): ?array
    {
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        if ($userAgent === '') {
            return null;
        }

        $url = $_SERVER['REQUEST_URI'] ?? '/';

        // Check bot crawl.
        $matchedBot = self::matchBot($userAgent, $botSignatures);
        if ($matchedBot !== null) {
            return [
                'type'          => 'bot_crawl',
                'user_agent'    => substr($userAgent, 0, 500),
                'url'           => substr($url, 0, 2000),
                'timestamp'     => gmdate('c'),
                'status_code'   => http_response_code() ?: 200,
                'response_size' => 0,
            ];
        }

        // Check AI referrer.
        $referer = $_SERVER['HTTP_REFERER'] ?? '';
        if ($referer === '') {
            return null;
        }

        $parsed = parse_url($referer);
        $hostname = $parsed['host'] ?? '';
        if ($hostname === '') {
            return null;
        }

        $matchedDomain = self::matchReferrer($hostname, $aiReferrers);
        if ($matchedDomain !== null) {
            return [
                'type'            => 'ai_referral',
                'referrer_domain' => $matchedDomain,
                'url'             => substr($url, 0, 2000),
                'timestamp'       => gmdate('c'),
            ];
        }

        return null;
    }
}
