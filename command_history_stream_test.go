package main

import "testing"

func TestCommandHistoryStreamExtractsMarkerAcrossChunks(t *testing.T) {
	stream := newCommandHistoryStream()

	out, commands := stream.Process([]byte("hello\x1fAETHER_CMD\x1fbHM="))
	if string(out) != "hello" {
		t.Fatalf("expected visible output to pass through, got %q", string(out))
	}
	if len(commands) != 0 {
		t.Fatalf("expected no command before marker end, got %v", commands)
	}

	out, commands = stream.Process([]byte("\x1e world"))
	if string(out) != " world" {
		t.Fatalf("expected trailing visible output, got %q", string(out))
	}
	if len(commands) != 1 || commands[0] != "ls" {
		t.Fatalf("expected extracted command ls, got %v", commands)
	}
}

func TestCommandHistoryStreamKeepsPartialMarkerOutOfVisibleOutput(t *testing.T) {
	stream := newCommandHistoryStream()

	out, commands := stream.Process([]byte("abc\x1fAETHER"))
	if string(out) != "abc" {
		t.Fatalf("expected non-marker text only, got %q", string(out))
	}
	if len(commands) != 0 {
		t.Fatalf("expected no commands, got %v", commands)
	}

	out, commands = stream.Process([]byte("_CMD\x1fcHdk\x1e!"))
	if string(out) != "!" {
		t.Fatalf("expected remaining visible output, got %q", string(out))
	}
	if len(commands) != 1 || commands[0] != "pwd" {
		t.Fatalf("expected extracted command pwd, got %v", commands)
	}
}

func TestCommandHistoryStreamIgnoresInvalidPayload(t *testing.T) {
	stream := newCommandHistoryStream()

	out, commands := stream.Process([]byte("x\x1fAETHER_CMD\x1fnot-base64\x1ey"))
	if string(out) != "xy" {
		t.Fatalf("expected marker to be stripped from visible output, got %q", string(out))
	}
	if len(commands) != 0 {
		t.Fatalf("expected invalid payload to be dropped, got %v", commands)
	}
}
