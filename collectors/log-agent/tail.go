package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
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
			log.Printf("Tail: %v, retrying in 2s...", err)
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

	// Get original inode for rotation detection.
	origInfo, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat %s: %w", path, err)
	}

	// Seek to end — only process new lines.
	if _, err := f.Seek(0, io.SeekEnd); err != nil {
		return fmt.Errorf("seek %s: %w", path, err)
	}

	// Track file position to avoid re-reading.
	pos, _ := f.Seek(0, io.SeekCurrent)

	pollInterval := 200 * time.Millisecond
	rotationCheck := time.NewTicker(2 * time.Second)
	defer rotationCheck.Stop()

	for {
		if ctx.Err() != nil {
			return nil
		}

		// Read all available new lines from current position.
		newLines := readNewLines(f, pos)
		if len(newLines) > 0 {
			for _, line := range newLines {
				onLine(line)
			}
			// Update position after successful read.
			pos, _ = f.Seek(0, io.SeekCurrent)
			continue
		}

		// No new data. Wait for new data or rotation.
		select {
		case <-ctx.Done():
			return nil
		case <-rotationCheck.C:
			// Check if inode changed (log rotated).
			newInfo, err := os.Stat(path)
			if err != nil {
				return fmt.Errorf("file gone: %w", err)
			}
			if !os.SameFile(origInfo, newInfo) {
				return nil // Rotated, reopen.
			}
			// Check if file was truncated (some rotation tools do this).
			currentSize, _ := f.Seek(0, io.SeekEnd)
			if currentSize < pos {
				log.Printf("Tail: file truncated, resetting to beginning")
				pos = 0
				f.Seek(0, io.SeekStart)
			} else {
				f.Seek(pos, io.SeekStart)
			}
		case <-time.After(pollInterval):
			// Just loop back to try reading.
		}
	}
}

// readNewLines reads all complete lines from the current file position.
func readNewLines(f *os.File, fromPos int64) []string {
	f.Seek(fromPos, io.SeekStart)
	scanner := bufio.NewScanner(f)
	// 64 KB max line (access logs can be long).
	scanner.Buffer(make([]byte, 0, 64*1024), 64*1024)

	var lines []string
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) > 0 {
			lines = append(lines, line)
		}
	}
	return lines
}
