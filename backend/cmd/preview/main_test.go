package main

import (
	"bytes"
	"log"
	"strings"
	"testing"
)

func TestWarnIfNonLocalhost(t *testing.T) {
	tests := []struct {
		name string
		addr string
		want bool
	}{
		{name: "localhost IPv4", addr: "127.0.0.1:8080", want: false},
		{name: "alternate IPv4 loopback", addr: "127.0.0.2:8080", want: false},
		{name: "IPv6 loopback", addr: "[::1]:8080", want: false},
		{name: "localhost name", addr: "localhost:8080", want: false},
		{name: "all interfaces", addr: "0.0.0.0:8080", want: true},
		{name: "private LAN", addr: "192.168.1.10:8080", want: true},
	}

	var buf bytes.Buffer
	oldOutput := log.Writer()
	oldFlags := log.Flags()
	oldPrefix := log.Prefix()
	log.SetOutput(&buf)
	log.SetFlags(0)
	log.SetPrefix("")
	defer func() {
		log.SetOutput(oldOutput)
		log.SetFlags(oldFlags)
		log.SetPrefix(oldPrefix)
	}()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf.Reset()

			warnIfNonLocalhost(tt.addr)

			got := buf.Len() > 0
			if got != tt.want {
				t.Fatalf("warnIfNonLocalhost(%q) warning = %v, want %v; log=%q", tt.addr, got, tt.want, buf.String())
			}
			if tt.want {
				logOutput := buf.String()
				if !strings.Contains(logOutput, "readable/local files") || !strings.Contains(logOutput, "reachable network") {
					t.Fatalf("warning log = %q, want readable/local files exposure risk for reachable network", logOutput)
				}
			}
		})
	}
}

func TestStartupMessage(t *testing.T) {
	got := startupMessage("/workspace", "127.0.0.1:8080")
	want := "serving /workspace at http://127.0.0.1:8080"
	if got != want {
		t.Fatalf("startupMessage() = %q, want %q", got, want)
	}
}
