package main

import (
	"bytes"
	"encoding/base64"
	"strings"
)

var historyMarkerStart = []byte("\x1fAETHER_CMD\x1f")

const historyMarkerEnd byte = 0x1e

type commandHistoryStream struct {
	visibleCarry []byte
	payloadCarry []byte
	inMarker     bool
	lastCommand  string // 去重：记录上次解析出的命令
}

func newCommandHistoryStream() *commandHistoryStream {
	return &commandHistoryStream{}
}

func (s *commandHistoryStream) Process(chunk []byte) ([]byte, []string) {
	if len(chunk) == 0 {
		return nil, nil
	}

	data := append(append([]byte{}, s.visibleCarry...), chunk...)
	s.visibleCarry = s.visibleCarry[:0]

	out := make([]byte, 0, len(data))
	commands := make([]string, 0, 1)

	for i := 0; i < len(data); {
		if s.inMarker {
			relEnd := bytes.IndexByte(data[i:], historyMarkerEnd)
			if relEnd == -1 {
				s.payloadCarry = append(s.payloadCarry, data[i:]...)
				return out, commands
			}

			end := i + relEnd
			s.payloadCarry = append(s.payloadCarry, data[i:end]...)
			if command := decodeHistoryMarkerPayload(s.payloadCarry); command != "" {
				if command != s.lastCommand {
					commands = append(commands, command)
					s.lastCommand = command
				}
			}
			s.payloadCarry = s.payloadCarry[:0]
			s.inMarker = false
			i = end + 1
			continue
		}

		relStart := bytes.Index(data[i:], historyMarkerStart)
		if relStart == -1 {
			remaining := data[i:]
			overlap := trailingMarkerPrefixLen(remaining)
			visibleEnd := len(remaining) - overlap
			if visibleEnd > 0 {
				out = append(out, remaining[:visibleEnd]...)
			}
			if overlap > 0 {
				s.visibleCarry = append(s.visibleCarry, remaining[visibleEnd:]...)
			}
			return out, commands
		}

		start := i + relStart
		if start > i {
			out = append(out, data[i:start]...)
		}
		i = start + len(historyMarkerStart)
		s.inMarker = true
	}

	return out, commands
}

func decodeHistoryMarkerPayload(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(payload)))
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(decoded))
}

func trailingMarkerPrefixLen(data []byte) int {
	limit := len(historyMarkerStart)
	if len(data) < limit {
		limit = len(data)
	}

	for size := limit; size > 0; size-- {
		if bytes.Equal(data[len(data)-size:], historyMarkerStart[:size]) {
			return size
		}
	}

	return 0
}
