package files

import (
	"mime"
	"testing"
)

func TestDetectRenderMode(t *testing.T) {
	tests := []struct {
		name     string
		sample   []byte
		wantMode RenderMode
		wantMIME string
	}{
		{name: "README.md", sample: []byte("# Read me\n"), wantMode: RenderModeMarkdown, wantMIME: "text/markdown"},
		{name: "main.go", sample: []byte("package main\n"), wantMode: RenderModeSource, wantMIME: "text/plain"},
		{name: "app.py", sample: []byte("print('hello')\n"), wantMode: RenderModeSource, wantMIME: "text/plain"},
		{name: "notes.txt", sample: []byte("plain notes\n"), wantMode: RenderModeText, wantMIME: "text/plain"},
		{name: "image.png", sample: testPNGBytes(), wantMode: RenderModeImage, wantMIME: "image/png"},
		{name: "index.html", sample: []byte("<!doctype html><title>x</title>"), wantMode: RenderModeSource, wantMIME: "text/html"},
		// SVG is textual but renders as an image (with a source view available).
		{name: "diagram.svg", sample: []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), wantMode: RenderModeImage, wantMIME: "image/svg+xml"},
		{name: "script.js", sample: []byte("console.log('x');\n"), wantMode: RenderModeSource, wantMIME: "text/javascript"},
		// Regression: ".mod" maps to audio/x-mod in the system mime database, but
		// go.mod is plain text and must not be classified as binary.
		{name: "go.mod", sample: []byte("module preview/backend\n\ngo 1.22\n"), wantMode: RenderModeText, wantMIME: "text/plain"},
		// Extension-less text file: classified as text from its content.
		{name: "Dockerfile", sample: []byte("FROM alpine:3\nRUN echo hi\n"), wantMode: RenderModeText, wantMIME: "text/plain"},
		// Binary content under an unknown extension: NUL byte marks it binary.
		{name: "blob", sample: []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x00}, wantMode: RenderModeBinary, wantMIME: "application/octet-stream"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotMode, gotMIME := DetectRenderMode(tt.name, tt.sample)
			if gotMode != tt.wantMode {
				t.Fatalf("DetectRenderMode(%q) mode = %q, want %q", tt.name, gotMode, tt.wantMode)
			}
			if gotBase := baseMediaType(t, gotMIME); gotBase != tt.wantMIME {
				t.Fatalf("DetectRenderMode(%q) MIME = %q, want base %q", tt.name, gotMIME, tt.wantMIME)
			}
		})
	}
}

func TestRawDisposition(t *testing.T) {
	tests := []struct {
		name     string
		mimeType string
		want     string
	}{
		{name: "index.html", mimeType: "text/html; charset=utf-8", want: "attachment"},
		{name: "diagram.svg", mimeType: "image/svg+xml", want: "attachment"},
		{name: "data.xml", mimeType: "application/xml", want: "attachment"},
		{name: "script.js", mimeType: "application/octet-stream", want: "attachment"},
		{name: "download.bin", mimeType: "application/javascript", want: "attachment"},
		{name: "notes.txt", mimeType: "text/plain; charset=utf-8", want: "inline"},
		{name: "image.png", mimeType: "image/png", want: "inline"},
		{name: "photo.jpg", mimeType: "image/jpeg", want: "inline"},
		{name: "spinner.gif", mimeType: "image/gif", want: "inline"},
		{name: "paper.pdf", mimeType: "application/pdf", want: "inline"},
		{name: "archive.bin", mimeType: "application/octet-stream", want: "attachment"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := RawDisposition(tt.name, tt.mimeType); got != tt.want {
				t.Fatalf("RawDisposition(%q, %q) = %q, want %q", tt.name, tt.mimeType, got, tt.want)
			}
		})
	}
}

func baseMediaType(t *testing.T, value string) string {
	t.Helper()

	base, _, err := mime.ParseMediaType(value)
	if err != nil {
		t.Fatalf("ParseMediaType(%q) error = %v", value, err)
	}
	return base
}
