<?php

/**
 * AilabsAudit Tracker — Generic PHP Collector
 *
 * Sends signed batch events to the AI Labs Audit ingestion API.
 *
 * HMAC format: "{timestamp}\n{method}\n{path}\n{body}"
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
    private string $apiKey;

    /** @var string */
    private string $apiSecret;

    /** @var string */
    private string $clientId;

    /** @var string */
    private string $apiUrl;

    /** @var int */
    private int $timeout;

    /** @var string */
    private string $version = '1.0.0';

    /** Override with your API domain. */
    private const DEFAULT_API_URL = 'https://YOUR_API_DOMAIN/api/v1';

    /**
     * @param string $apiKey    API key for X-API-Key header.
     * @param string $apiSecret HMAC secret key.
     * @param string $clientId  Client identifier.
     * @param string $apiUrl    API base URL.
     * @param int    $timeout   HTTP timeout in seconds.
     */
    public function __construct(
        string $apiKey,
        string $apiSecret,
        string $clientId,
        string $apiUrl = self::DEFAULT_API_URL,
        int $timeout = 5
    ) {
        $this->apiKey    = $apiKey;
        $this->apiSecret = $apiSecret;
        $this->clientId  = $clientId;
        $this->apiUrl    = rtrim($apiUrl, '/');
        $this->timeout   = $timeout;
    }

    // -----------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------

    /**
     * Send a batch of events to the API.
     *
     * @param array<int, array<string, mixed>> $events
     * @return array{success: bool, status_code: int, body: string}
     */
    public function sendEvents(array $events): array
    {
        $payload = json_encode([
            'client_id'      => $this->clientId,
            'plugin_type'    => 'php',
            'plugin_version' => $this->version,
            'batch_id'       => $this->uuid4(),
            'events'         => $events,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        if ($payload === false) {
            return ['success' => false, 'status_code' => 0, 'body' => 'json_encode failed'];
        }

        return $this->send('POST', '/api/v1/tracking/events', '/tracking/events', $payload);
    }

    /**
     * Verify API connection.
     *
     * @return array{success: bool, status_code: int, body: string}
     */
    public function verifyConnection(): array
    {
        $payload = json_encode([
            'tracking_api_key' => $this->apiKey,
            'client_id'        => $this->clientId,
            'plugin_type'      => 'php',
            'plugin_version'   => $this->version,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        if ($payload === false) {
            return ['success' => false, 'status_code' => 0, 'body' => 'json_encode failed'];
        }

        return $this->send('POST', '/api/v1/tracking/verify', '/tracking/verify', $payload);
    }

    // -----------------------------------------------------------------
    // HMAC signing
    // -----------------------------------------------------------------

    /**
     * Compute HMAC-SHA256 signature.
     *
     * Format: "{timestamp}\n{method}\n{path}\n{body}"
     *
     * @param string $timestamp Unix epoch seconds.
     * @param string $method    HTTP method.
     * @param string $path      API path.
     * @param string $body      JSON body (empty string for GET).
     * @param string $secret    HMAC secret.
     * @return string Lowercase hex signature (64 chars).
     */
    public static function sign(string $timestamp, string $method, string $path, string $body, string $secret): string
    {
        $stringToSign = $timestamp . "\n" . $method . "\n" . $path . "\n" . $body;
        return hash_hmac('sha256', $stringToSign, $secret);
    }

    /**
     * Build the X-Signature header value (raw hex, no prefix).
     *
     * @param string $timestamp
     * @param string $method
     * @param string $path
     * @param string $body
     * @param string $secret
     * @return string
     */
    public static function signatureHeader(string $timestamp, string $method, string $path, string $body, string $secret): string
    {
        return self::sign($timestamp, $method, $path, $body, $secret);
    }

    // -----------------------------------------------------------------
    // HTTP transport
    // -----------------------------------------------------------------

    /**
     * Send a signed request to the API.
     *
     * @param string $method   HTTP method.
     * @param string $hmacPath Path used for HMAC (includes /api/v1 prefix).
     * @param string $urlPath  Path appended to API URL.
     * @param string $body     JSON body.
     * @return array{success: bool, status_code: int, body: string}
     */
    private function send(string $method, string $hmacPath, string $urlPath, string $body): array
    {
        $timestamp = (string) time();
        $nonce     = $this->uuid4();
        $signature = self::sign($timestamp, $method, $hmacPath, $body, $this->apiSecret);

        $ch = curl_init($this->apiUrl . $urlPath);
        if ($ch === false) {
            return ['success' => false, 'status_code' => 0, 'body' => 'curl_init failed'];
        }

        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-API-Key: '    . $this->apiKey,
                'X-Timestamp: '  . $timestamp,
                'X-Nonce: '      . $nonce,
                'X-Signature: '  . $signature,
                'User-Agent: AilabsauditTracker/' . $this->version . ' PHP/' . PHP_VERSION,
            ],
        ]);

        $responseBody = curl_exec($ch);
        $httpCode     = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error        = curl_error($ch);
        curl_close($ch);

        if ($responseBody === false) {
            return ['success' => false, 'status_code' => 0, 'body' => $error];
        }

        return [
            'success'     => $httpCode >= 200 && $httpCode < 300,
            'status_code' => $httpCode,
            'body'        => (string) $responseBody,
        ];
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    /**
     * Generate a UUID v4.
     */
    private function uuid4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr(ord($bytes[6]) & 0x0f | 0x40);
        $bytes[8] = chr(ord($bytes[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
