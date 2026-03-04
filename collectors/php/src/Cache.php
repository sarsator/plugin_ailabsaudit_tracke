<?php

/**
 * List cache with API refresh, ETag support, and TTL.
 *
 * @license MIT
 */

declare(strict_types=1);

namespace AilabsAudit\Tracker;

class Cache
{
    private const TTL = 86400; // 24 hours.

    private string $apiUrl;
    private string $apiKey;
    private string $apiSecret;

    /** @var string[] */
    private array $botSignatures;

    /** @var string[] */
    private array $aiReferrers;

    private string $botEtag = '';
    private string $referrerEtag = '';
    private int $botExpiresAt = 0;
    private int $referrerExpiresAt = 0;

    public function __construct(string $apiUrl, string $apiKey, string $apiSecret)
    {
        $this->apiUrl    = rtrim($apiUrl, '/');
        $this->apiKey    = $apiKey;
        $this->apiSecret = $apiSecret;
        $this->botSignatures = Defaults::botSignatures();
        $this->aiReferrers   = Defaults::aiReferrers();
    }

    /** @return string[] */
    public function getBotSignatures(): array
    {
        if (time() > $this->botExpiresAt) {
            $this->refreshBotSignatures();
        }
        return $this->botSignatures;
    }

    /** @return string[] */
    public function getAiReferrers(): array
    {
        if (time() > $this->referrerExpiresAt) {
            $this->refreshAiReferrers();
        }
        return $this->aiReferrers;
    }

    private function refreshBotSignatures(): void
    {
        $path = '/api/v1/bot-signatures';
        $result = $this->fetchList($path, $this->botEtag);

        if ($result === null) {
            $this->botExpiresAt = time() + self::TTL;
            return;
        }

        if (isset($result['data']['signatures']) && is_array($result['data']['signatures'])) {
            $patterns = array_filter(
                array_column($result['data']['signatures'], 'pattern'),
                function ($p): bool {
                    return is_string($p) && strlen($p) > 0 && strlen($p) < 256;
                }
            );
            $patterns = array_values($patterns);
            if (!empty($patterns)) {
                $this->botSignatures = $patterns;
                $this->botEtag = $result['etag'];
            }
        }
        $this->botExpiresAt = time() + self::TTL;
    }

    private function refreshAiReferrers(): void
    {
        $path = '/api/v1/ai-referrers';
        $result = $this->fetchList($path, $this->referrerEtag);

        if ($result === null) {
            $this->referrerExpiresAt = time() + self::TTL;
            return;
        }

        if (isset($result['data']['referrers']) && is_array($result['data']['referrers'])) {
            $domains = array_filter(
                array_column($result['data']['referrers'], 'domain'),
                function ($d): bool {
                    return is_string($d) && strlen($d) > 0 && strlen($d) < 256;
                }
            );
            $domains = array_values($domains);
            if (!empty($domains)) {
                $this->aiReferrers = $domains;
                $this->referrerEtag = $result['etag'];
            }
        }
        $this->referrerExpiresAt = time() + self::TTL;
    }

    /**
     * Fetch a signed list from the API with ETag support.
     *
     * @return array{data: array, etag: string}|null Null on 304 or error.
     */
    private function fetchList(string $path, string $etag): ?array
    {
        $timestamp = (string) time();
        $signature = AilabsTracker::sign($timestamp, 'GET', $path, '', $this->apiSecret);

        $urlPath = str_replace('/api/v1', '', $path);
        $url = $this->apiUrl . $urlPath;

        $headers = [
            'X-API-Key: '   . $this->apiKey,
            'X-Timestamp: ' . $timestamp,
            'X-Signature: ' . $signature,
            'User-Agent: AilabsauditTracker/1.0.0 PHP/' . PHP_VERSION,
        ];
        if ($etag !== '') {
            $headers[] = 'If-None-Match: ' . $etag;
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_HTTPGET        => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_HEADER         => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        if ($response === false || $httpCode === 304) {
            return null;
        }

        if ($httpCode === 200) {
            $headerText = substr((string) $response, 0, $headerSize);
            $body = substr((string) $response, $headerSize);
            $data = json_decode($body, true);

            $newEtag = '';
            if (preg_match('/^ETag:\s*(.+)$/mi', $headerText, $matches)) {
                $newEtag = trim($matches[1]);
            }

            if (is_array($data)) {
                return ['data' => $data, 'etag' => $newEtag];
            }
        }

        return null;
    }
}
