package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"time"
)

// tailFile follows a file like `tail -F`, handling log rotation.
// Calls onLine for each new line. Blocks until ctx is cancelled.
func tailFile(ctx context.Context, path string, onLine func(string)) error {
	for {
		if ctx.Err() != nil {
			return nil
		}

		err := tailFileOnce(ctx, path, onLine)
		if err != nil && ctx.Err() == nil {
			// File may have been rotated or deleted. Wait and retry.
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(2 * time.Second):
			}
		}
	}
}

// tailFileOnce opens and tails a single file instance.
// Returns when the file is rotated (inode change) or an error occurs.
func tailFileOnce(ctx context.Context, path string, onLine func(string)) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	// Get original inode.
	origInfo, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat %s: %w", path, err)
	}

	// Seek to end — only process new lines.
	f.Seek(0, 2)

	scanner := bufio.NewScanner(f)
	// 64 KB max line length (access logs can be long).
	scanner.Buffer(make([]byte, 0, 64*1024), 64*1024)

	pollInterval := 200 * time.Millisecond
	rotationCheck := time.NewTicker(2 * time.Second)
	defer rotationCheck.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		if scanner.Scan() {
			line := scanner.Text()
			if len(line) > 0 {
				onLine(line)
			}
			continue
		}

		// No more data. Check for rotation or wait.
		if err := scanner.Err(); err != nil {
			return fmt.Errorf("scanner error: %w", err)
		}

		select {
		case <-ctx.Done():
			return nil
		case <-rotationCheck.C:
			// Check if inode changed (log rotated).
			newInfo, err := os.Stat(path)
			if err != nil {
				// File removed, will be recreated.
				return fmt.Errorf("file gone: %w", err)
			}
			if !os.SameFile(origInfo, newInfo) {
				// File rotated — reopen.
				return nil
			}
		case <-time.After(pollInterval):
			// Reset scanner to pick up new data appended to file.
			scanner = bufio.NewScanner(f)
			scanner.Buffer(make([]byte, 0, 64*1024), 64*1024)
		}
	}
}
