<?php

/**
 * Event buffer with file-based persistence and LOCK_EX protection.
 *
 * Uses register_shutdown_function for automatic save on request end.
 *
 * @license MIT
 */

declare(strict_types=1);

namespace AilabsAudit\Tracker;

class Buffer
{
    private const MAX_SIZE = 500;
    private const FLUSH_INTERVAL = 300;  // 5 minutes.
    private const FLUSH_DEBOUNCE = 30;   // 30 seconds.
    private const MAX_RETRIES = 3;

    private string $storagePath;

    /** @var callable */
    private $sendEvents;

    /** @var array<int, array<string, mixed>> */
    private array $events = [];

    private bool $dirty = false;
    private bool $shutdownRegistered = false;

    /**
     * @param string   $storagePath Path to buffer JSON file.
     * @param callable $sendEvents  Function to send events: fn(array $events): array.
     */
    public function __construct(string $storagePath, callable $sendEvents)
    {
        $this->storagePath = $storagePath;
        $this->sendEvents  = $sendEvents;
        $this->load();
    }

    /**
     * Add an event. Auto-flushes at MAX_SIZE.
     *
     * @param array<string, mixed> $event
     */
    public function add(array $event): void
    {
        $this->events[] = $event;
        $this->dirty = true;

        // Cap: drop OLDEST events (keep newest).
        if (count($this->events) > self::MAX_SIZE) {
            $dropped = count($this->events) - self::MAX_SIZE;
            $this->events = array_slice($this->events, $dropped);
            error_log("AilabsAudit: buffer overflow, dropped {$dropped} oldest events");
        }

        $this->registerShutdown();

        if (count($this->events) >= self::MAX_SIZE) {
            $this->flush();
        }
    }

    /**
     * Flush buffer if debounce allows.
     */
    public function flush(): void
    {
        if (empty($this->events)) {
            return;
        }

        // Debounce check via file modification time of a lock file.
        $debounceFile = $this->storagePath . '.lastflush';
        if (file_exists($debounceFile)) {
            $lastFlush = (int) filemtime($debounceFile);
            if (time() - $lastFlush < self::FLUSH_DEBOUNCE) {
                return;
            }
        }

        // Check if interval has passed since buffer was last written.
        if (file_exists($this->storagePath)) {
            $bufferAge = time() - (int) filemtime($this->storagePath);
            if ($bufferAge < self::FLUSH_INTERVAL && count($this->events) < self::MAX_SIZE) {
                return;
            }
        }

        $this->doFlush();
    }

    /** @return int */
    public function size(): int
    {
        return count($this->events);
    }

    /**
     * Save buffer to disk (called on shutdown).
     */
    public function save(): void
    {
        if (!$this->dirty) {
            return;
        }
        $this->doFlush();
        // Save any remaining events.
        if (!empty($this->events)) {
            $this->writeToDisk();
        }
    }

    private function doFlush(): void
    {
        if (empty($this->events)) {
            return;
        }

        $events = $this->events;
        $this->events = [];
        $this->dirty = true;

        // Mark debounce.
        $debounceFile = $this->storagePath . '.lastflush';
        touch($debounceFile);

        try {
            $result = ($this->sendEvents)($events);
            if (isset($result['success']) && $result['success']) {
                $this->writeToDisk();
                return;
            }

            $statusCode = $result['status_code'] ?? 0;
            if ($statusCode === 401 || $statusCode === 403) {
                $this->writeToDisk();
                return;
            }

            $this->reStore($events);
        } catch (\Throwable $e) {
            $this->reStore($events);
        }

        $this->writeToDisk();
    }

    /**
     * @param array<int, array<string, mixed>> $events
     */
    private function reStore(array $events): void
    {
        $retryFile = $this->storagePath . '.retries';
        $retryCount = 0;
        if (file_exists($retryFile)) {
            $retryCount = (int) file_get_contents($retryFile);
        }

        if ($retryCount >= self::MAX_RETRIES) {
            @unlink($retryFile);
            return;
        }

        file_put_contents($retryFile, (string) ($retryCount + 1), LOCK_EX);
        $this->events = array_merge($events, $this->events);
        $this->events = array_slice($this->events, 0, self::MAX_SIZE);
    }

    private function load(): void
    {
        if (!file_exists($this->storagePath)) {
            return;
        }

        $content = file_get_contents($this->storagePath);
        if ($content === false) {
            return;
        }

        $data = json_decode($content, true);
        if (is_array($data)) {
            $this->events = array_slice($data, 0, self::MAX_SIZE);
        }
    }

    private function writeToDisk(): void
    {
        $json = json_encode($this->events, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json !== false) {
            $dir = dirname($this->storagePath);
            if (!is_dir($dir)) {
                mkdir($dir, 0750, true);
            }
            file_put_contents($this->storagePath, $json, LOCK_EX);
        }
        $this->dirty = false;
    }

    private function registerShutdown(): void
    {
        if ($this->shutdownRegistered) {
            return;
        }
        $this->shutdownRegistered = true;
        register_shutdown_function([$this, 'save']);
    }
}
