package main

import (
	"regexp"
	"strconv"
)

// logEntry holds parsed fields from an access log line.
type logEntry struct {
	URL          string
	StatusCode   int
	ResponseSize int
	Referer      string
	UserAgent    string
}

// Combined/Common log format regex (Nginx & Apache defaults).
// 127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET /page HTTP/1.1" 200 2326 "http://ref" "UA"
var logPattern = regexp.MustCompile(
	`^(\S+)\s+` + // IP
		`\S+\s+` + // ident
		`\S+\s+` + // user
		`\[[^\]]+\]\s+` + // timestamp
		`"(\S+)\s+` + // method
		`(\S+)\s+` + // URL
		`[^"]*"\s+` + // protocol
		`(\d{3})\s+` + // status code (exactly 3 digits via regex)
		`(\S+)` + // response size
		`(?:\s+"([^"]*)"\s+` + // referer
		`"([^"]*)")?`, // user-agent
)

// parseLogLine parses a combined/common log format line.
// Returns nil if the line does not match.
func parseLogLine(line string) *logEntry {
	m := logPattern.FindStringSubmatch(line)
	if m == nil {
		return nil
	}

	// Status code is guaranteed to be 3 digits by regex (\d{3}).
	status, err := strconv.Atoi(m[4])
	if err != nil || status < 100 || status > 599 {
		return nil
	}

	size := 0
	if m[5] != "-" {
		size, _ = strconv.Atoi(m[5])
		if size < 0 {
			size = 0
		}
	}

	referer := ""
	if len(m) > 6 {
		referer = m[6]
	}

	ua := ""
	if len(m) > 7 {
		ua = m[7]
	}

	return &logEntry{
		URL:          m[3],
		StatusCode:   status,
		ResponseSize: size,
		Referer:      referer,
		UserAgent:    ua,
	}
}
