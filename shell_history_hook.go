package main

import (
	"bytes"
	"fmt"
	"path"
	"strings"

	"golang.org/x/crypto/ssh"
)

func detectRemoteShell(client *ssh.Client) string {
	if client == nil {
		return ""
	}

	session, err := client.NewSession()
	if err != nil {
		return ""
	}
	defer session.Close()

	var stdout bytes.Buffer
	session.Stdout = &stdout

	const cmd = `getent passwd "$(id -un 2>/dev/null || printf '%s' "$USER")" 2>/dev/null | cut -d: -f7 | head -n1 || true; printf '%s\n' "${SHELL:-}"`
	if err := session.Run(cmd); err != nil {
		return ""
	}

	for _, line := range strings.Split(stdout.String(), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			return trimmed
		}
	}

	return ""
}

func buildShellLaunchCommand(shellPath string) (string, bool) {
	if !isBashShell(shellPath) {
		return "", false
	}

	hook := `if [ -n "${AETHER_PROMPT_SEEN:-}" ]; then AETHER_LAST="$(fc -ln -1 2>/dev/null)"; AETHER_LAST="${AETHER_LAST#"${AETHER_LAST%%[![:space:]]*}"}"; if [ -n "$AETHER_LAST" ]; then AETHER_ENCODED="$(printf '%s' "$AETHER_LAST" | base64 | tr -d '\r\n')"; printf '\037AETHER_CMD\037%s\036' "$AETHER_ENCODED"; fi; fi; AETHER_PROMPT_SEEN=1; if [ -n "${AETHER_OLD_PROMPT_COMMAND:-}" ]; then eval "$AETHER_OLD_PROMPT_COMMAND"; fi`

	command := fmt.Sprintf(
		"export HISTCONTROL=; export HISTIGNORE=; export AETHER_OLD_PROMPT_COMMAND=\"$PROMPT_COMMAND\"; export PROMPT_COMMAND=%s; exec %s -il",
		shellQuote(hook),
		shellQuote(shellPath),
	)

	return command, true
}

func isBashShell(shellPath string) bool {
	return strings.EqualFold(path.Base(strings.TrimSpace(shellPath)), "bash")
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}
