<?php

/**
 * AilabsAudit Tracker — Generic PHP Collector
 *
 * Captures page views and custom events, signs payloads with HMAC-SHA256,
 * and sends them to the AI Labs Audit ingestion API.
 *
 * PHP 7.4+ — no external dependencies.
 *
 * @license MIT
 */

declare(strict_types=1);

namespace AilabsAudit\Tracker;

class AilabsTracker
{
    /** @var string */
    private string $trackerId;

    /** @var string */
    private string $apiSecret;

    /** @var string */
    private string $apiUrl;

    /** @var array<string, mixed> */
    private array $options;

    private const DEFAULT_API_URL = 'https://api.ailabsaudit.com/v1/collect';

    /**
     * @param string $trackerId Tracker ID (e.g. TRK-00001).
     * @param string $apiSecret HMAC secret key.
     * @param string $apiUrl    API endpoint URL.
     * @param array<string, mixed> $options  Additional options:
     *   - anonymize_ip (bool): Zero last IP octet. Default: true.
     *   - timeout (int): HTTP timeout in seconds. Default: 5.
     */
    public function __construct(
        string $trackerId,
        string $apiSecret,
        string $apiUrl = self::DEFAULT_API_URL,
        array $options = []
    ) {
        $this->trackerId = $trackerId;
        $this->apiSecret = $apiSecret;
        $this->apiUrl    = $apiUrl;
        $this->options   = array_merge([
            'anonymize_ip' => true,
            'timeout'      => 5,
        ], $options);
    }

    // -----------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------

    /**
     * Track a page view for the current request.
     *
     * @param array<string, mixed> $meta Optional metadata.
     * @return array{success: bool, status_code: int, body: string}
     */
    public function trackPageView(array $meta = []): array
    {
        $url = $this->getCurrentUrl();
        return $this->trackEvent('page_view', $url, $meta);
    }

    /**
     * Track a custom event.
     *
     * @param string $event Event name (e.g. "cta_click").
     * @param string $url   Page URL.
     * @param array<string, mixed> $meta Optional metadata.
     * @return array{success: bool, status_code: int, body: string}
     */
    public function trackEvent(string $event, string $url, array $meta = []): array
    {
        $payload = $this->buildPayload($event, $url, $meta);
        return $this->send($payload);
    }

    // -----------------------------------------------------------------
    // Canonicalization & HMAC signing
    // -----------------------------------------------------------------

    /**
     * Canonicalize a payload: sort keys recursively, compact JSON.
     *
     * @param array<string, mixed> $payload
     * @return string Canonical JSON string.
     */
    public static function canonicalize(array $payload): string
    {
        $sorted = self::sortRecursive($payload);
        $json = json_encode($sorted, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return '{}';
        }
        return $json;
    }

    /**
     * Compute HMAC-SHA256 signature of a canonical JSON string.
     *
     * @param string $canonicalJson Canonicalized payload.
     * @param string $secret        HMAC secret.
     * @return string Lowercase hex signature (64 chars).
     */
    public static function sign(string $canonicalJson, string $secret): string
    {
        return hash_hmac('sha256', $canonicalJson, $secret);
    }

    /**
     * Build the X-Signature header value.
     *
     * @param string $canonicalJson Canonicalized payload.
     * @param string $secret        HMAC secret.
     * @return string e.g. "sha256=abcdef..."
     */
    public static function signatureHeader(string $canonicalJson, string $secret): string
    {
        return 'sha256=' . self::sign($canonicalJson, $secret);
    }

    // -----------------------------------------------------------------
    // Payload building
    // -----------------------------------------------------------------

    /**
     * Build a tracking payload array.
     *
     * @param string $event Event type.
     * @param string $url   Page URL.
     * @param array<string, mixed> $meta  Optional metadata.
     * @return array<string, mixed>
     */
    private function buildPayload(string $event, string $url, array $meta = []): array
    {
        $payload = [
            'event'      => $event,
            'timestamp'  => gmdate('Y-m-d\TH:i:s\Z'),
            'tracker_id' => $this->trackerId,
            'url'        => $url,
        ];

        $referrer = $_SERVER['HTTP_REFERER'] ?? '';
        if ($referrer !== '') {
            $payload['referrer'] = $referrer;
        }

        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        if ($userAgent !== '') {
            $payload['user_agent'] = $userAgent;
        }

        $ip = $this->getClientIp();
        if ($ip !== '') {
            $payload['ip'] = $this->options['anonymize_ip']
                ? $this->anonymizeIp($ip)
                : $ip;
        }

        if (!empty($meta)) {
            $payload['meta'] = $meta;
        }

        return $payload;
    }

    // -----------------------------------------------------------------
    // HTTP transport
    // -----------------------------------------------------------------

    /**
     * Send a signed payload to the API.
     *
     * @param array<string, mixed> $payload
     * @return array{success: bool, status_code: int, body: string}
     */
    private function send(array $payload): array
    {
        $canonical = self::canonicalize($payload);
        $signature = self::signatureHeader($canonical, $this->apiSecret);
        $timestamp = $payload['timestamp'] ?? gmdate('Y-m-d\TH:i:s\Z');

        $ch = curl_init($this->apiUrl);
        if ($ch === false) {
            return ['success' => false, 'status_code' => 0, 'body' => 'curl_init failed'];
        }

        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $canonical,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => (int) $this->options['timeout'],
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Tracker-Id: ' . $this->trackerId,
                'X-Signature: '  . $signature,
                'X-Timestamp: '  . $timestamp,
                'User-Agent: AilabsAudit-PHP/1.0.0',
            ],
        ]);

        $body     = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return ['success' => false, 'status_code' => 0, 'body' => $error];
        }

        return [
            'success'     => $httpCode >= 200 && $httpCode < 300,
            'status_code' => $httpCode,
            'body'        => (string) $body,
        ];
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    /**
     * Recursively sort array keys alphabetically.
     *
     * @param mixed $data
     * @return mixed
     */
    private static function sortRecursive($data)
    {
        if (!is_array($data)) {
            return $data;
        }

        // Associative array check.
        if (array_keys($data) !== range(0, count($data) - 1)) {
            ksort($data, SORT_STRING);
        }

        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $data[$key] = self::sortRecursive($value);
            }
        }

        return $data;
    }

    /**
     * Get client IP from common headers.
     */
    private function getClientIp(): string
    {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $header) {
            $value = $_SERVER[$header] ?? '';
            if ($value === '') {
                continue;
            }
            // X-Forwarded-For may contain multiple IPs.
            if (strpos($value, ',') !== false) {
                $value = trim(explode(',', $value)[0]);
            }
            if (filter_var($value, FILTER_VALIDATE_IP)) {
                return $value;
            }
        }
        return '';
    }

    /**
     * Anonymize IP by zeroing last octet (IPv4) or last 80 bits (IPv6).
     */
    private function anonymizeIp(string $ip): string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return preg_replace('/\.\d+$/', '.0', $ip) ?? $ip;
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $packed = inet_pton($ip);
            if ($packed !== false) {
                return inet_ntop(substr($packed, 0, 6) . str_repeat("\0", 10));
            }
        }
        return $ip;
    }

    /**
     * Get the current page URL from server variables.
     */
    private function getCurrentUrl(): string
    {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $uri    = $_SERVER['REQUEST_URI'] ?? '/';
        return $scheme . '://' . $host . $uri;
    }
}
