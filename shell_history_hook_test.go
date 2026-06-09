package main

import (
	"strings"
	"testing"
)

func TestBuildShellLaunchCommandForBash(t *testing.T) {
	command, hooked := buildShellLaunchCommand("/bin/bash")
	if !hooked {
		t.Fatal("expected bash launch to enable hook")
	}
	if !strings.Contains(command, "PROMPT_COMMAND=") {
		t.Fatalf("expected prompt command injection, got %q", command)
	}
	if !strings.Contains(command, "AETHER_CMD") {
		t.Fatalf("expected hidden command marker, got %q", command)
	}
	if !strings.Contains(command, "exec '/bin/bash' -il") {
		t.Fatalf("expected launch to exec the detected shell, got %q", command)
	}
}

func TestBuildShellLaunchCommandFallsBackForNonBashShell(t *testing.T) {
	command, hooked := buildShellLaunchCommand("/bin/zsh")
	if hooked {
		t.Fatalf("expected non-bash shell to skip hook, got %q", command)
	}
	if command != "" {
		t.Fatalf("expected empty command for unsupported shell, got %q", command)
	}
}
