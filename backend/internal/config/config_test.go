package config

import (
	"reflect"
	"strings"
	"testing"
)

func TestDefault(t *testing.T) {
	cfg := Default()

	if cfg.Addr != "127.0.0.1:8080" {
		t.Fatalf("Addr = %q, want %q", cfg.Addr, "127.0.0.1:8080")
	}
	if cfg.MaxPreviewSize != 2*1024*1024 {
		t.Fatalf("MaxPreviewSize = %d, want %d", cfg.MaxPreviewSize, 2*1024*1024)
	}
	if cfg.MaxRawFileSize != 100*1024*1024 {
		t.Fatalf("MaxRawFileSize = %d, want %d", cfg.MaxRawFileSize, 100*1024*1024)
	}
	if cfg.MaxDirEntries != 5000 {
		t.Fatalf("MaxDirEntries = %d, want %d", cfg.MaxDirEntries, 5000)
	}
}

func TestParseSizeAcceptsSupportedUnits(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  int64
	}{
		{name: "bytes", input: "123", want: 123},
		{name: "uppercase KB", input: "4KB", want: 4 * 1024},
		{name: "uppercase MB", input: "5MB", want: 5 * 1024 * 1024},
		{name: "uppercase GB", input: "6GB", want: 6 * 1024 * 1024 * 1024},
		{name: "lowercase kb", input: "7kb", want: 7 * 1024},
		{name: "lowercase mb", input: "8mb", want: 8 * 1024 * 1024},
		{name: "lowercase gb", input: "9gb", want: 9 * 1024 * 1024 * 1024},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseSize(tt.input)
			if err != nil {
				t.Fatalf("ParseSize(%q) error = %v", tt.input, err)
			}
			if got != tt.want {
				t.Fatalf("ParseSize(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseSizeRejectsInvalidInputs(t *testing.T) {
	tests := []string{
		"",
		"0",
		"0MB",
		"-1",
		"-1MB",
		"1TB",
		"abc",
		"10 MB",
		" 10MB",
		"10MB ",
	}

	for _, input := range tests {
		t.Run(input, func(t *testing.T) {
			if got, err := ParseSize(input); err == nil {
				t.Fatalf("ParseSize(%q) = %d, want error", input, got)
			}
		})
	}
}

func TestParseArgsRequiresRoot(t *testing.T) {
	if _, err := ParseArgs(nil); err == nil {
		t.Fatal("ParseArgs(nil) error = nil, want missing root error")
	}
	if _, err := ParseArgs([]string{"--addr", "0.0.0.0:9090"}); err == nil {
		t.Fatal("ParseArgs(flags only) error = nil, want missing root error")
	}
}

func TestParseArgsRejectsWhitespaceOnlyRoot(t *testing.T) {
	for _, input := range []string{"", "   ", "\t"} {
		t.Run(input, func(t *testing.T) {
			_, err := ParseArgs([]string{input})
			if err == nil {
				t.Fatal("ParseArgs() error = nil, want invalid root error")
			}
		})
	}
}

func TestParseArgsRootOnlyUsesDefaults(t *testing.T) {
	defaults := Default()

	cfg, err := ParseArgs([]string{"/workspace"})
	if err != nil {
		t.Fatalf("ParseArgs() error = %v", err)
	}

	if cfg.Root != "/workspace" {
		t.Fatalf("Root = %q, want %q", cfg.Root, "/workspace")
	}
	if cfg.Addr != defaults.Addr {
		t.Fatalf("Addr = %q, want default %q", cfg.Addr, defaults.Addr)
	}
	if cfg.ShowHidden != defaults.ShowHidden {
		t.Fatalf("ShowHidden = %v, want default %v", cfg.ShowHidden, defaults.ShowHidden)
	}
	if !reflect.DeepEqual(cfg.AllowedSymlinkRoots, defaults.AllowedSymlinkRoots) {
		t.Fatalf("AllowedSymlinkRoots = %#v, want default %#v", cfg.AllowedSymlinkRoots, defaults.AllowedSymlinkRoots)
	}
	if cfg.MaxPreviewSize != defaults.MaxPreviewSize {
		t.Fatalf("MaxPreviewSize = %d, want default %d", cfg.MaxPreviewSize, defaults.MaxPreviewSize)
	}
	if cfg.MaxRawFileSize != defaults.MaxRawFileSize {
		t.Fatalf("MaxRawFileSize = %d, want default %d", cfg.MaxRawFileSize, defaults.MaxRawFileSize)
	}
	if cfg.MaxDirEntries != defaults.MaxDirEntries {
		t.Fatalf("MaxDirEntries = %d, want default %d", cfg.MaxDirEntries, defaults.MaxDirEntries)
	}
	if cfg.Dev != defaults.Dev {
		t.Fatalf("Dev = %v, want default %v", cfg.Dev, defaults.Dev)
	}
}

func TestParseArgsSetsFlags(t *testing.T) {
	cfg, err := ParseArgs([]string{
		"--addr", "0.0.0.0:9090",
		"--show-hidden",
		"--allow-symlink-root", "/linked/a",
		"--allow-symlink-root", "/linked/b",
		"--max-preview-size", "3MB",
		"--max-raw-file-size", "1GB",
		"--max-dir-entries", "42",
		"--dev",
		"/workspace",
	})
	if err != nil {
		t.Fatalf("ParseArgs() error = %v", err)
	}

	if cfg.Root != "/workspace" {
		t.Fatalf("Root = %q, want %q", cfg.Root, "/workspace")
	}
	if cfg.Addr != "0.0.0.0:9090" {
		t.Fatalf("Addr = %q, want %q", cfg.Addr, "0.0.0.0:9090")
	}
	if !cfg.ShowHidden {
		t.Fatal("ShowHidden = false, want true")
	}
	if !reflect.DeepEqual(cfg.AllowedSymlinkRoots, []string{"/linked/a", "/linked/b"}) {
		t.Fatalf("AllowedSymlinkRoots = %#v, want %#v", cfg.AllowedSymlinkRoots, []string{"/linked/a", "/linked/b"})
	}
	if cfg.MaxPreviewSize != 3*1024*1024 {
		t.Fatalf("MaxPreviewSize = %d, want %d", cfg.MaxPreviewSize, 3*1024*1024)
	}
	if cfg.MaxRawFileSize != 1024*1024*1024 {
		t.Fatalf("MaxRawFileSize = %d, want %d", cfg.MaxRawFileSize, 1024*1024*1024)
	}
	if cfg.MaxDirEntries != 42 {
		t.Fatalf("MaxDirEntries = %d, want %d", cfg.MaxDirEntries, 42)
	}
	if !cfg.Dev {
		t.Fatal("Dev = false, want true")
	}
}

func TestParseArgsAcceptsRootInAnyPosition(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{name: "root before flags", args: []string{"/workspace", "--addr", "0.0.0.0:9090", "--show-hidden"}},
		{name: "root between flags", args: []string{"--show-hidden", "/workspace", "--addr", "0.0.0.0:9090"}},
		{name: "root after flags", args: []string{"--show-hidden", "--addr", "0.0.0.0:9090", "/workspace"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := ParseArgs(tt.args)
			if err != nil {
				t.Fatalf("ParseArgs(%v) error = %v", tt.args, err)
			}
			if cfg.Root != "/workspace" {
				t.Fatalf("Root = %q, want %q", cfg.Root, "/workspace")
			}
			if cfg.Addr != "0.0.0.0:9090" {
				t.Fatalf("Addr = %q, want %q", cfg.Addr, "0.0.0.0:9090")
			}
			if !cfg.ShowHidden {
				t.Fatal("ShowHidden = false, want true")
			}
		})
	}
}

func TestParseArgsRejectsMultiplePositionalArgs(t *testing.T) {
	for _, args := range [][]string{
		{"/workspace", "typo"},
		{"--addr", "0.0.0.0:9090", "/a", "/b"},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			if _, err := ParseArgs(args); err == nil {
				t.Fatal("ParseArgs() error = nil, want extra positional arg error")
			}
		})
	}
}

func TestParseArgsRejectsEmptyAllowedSymlinkRoot(t *testing.T) {
	for _, input := range []string{"", "   ", "\t"} {
		t.Run(input, func(t *testing.T) {
			_, err := ParseArgs([]string{"/workspace", "--allow-symlink-root", input})
			if err == nil {
				t.Fatal("ParseArgs() error = nil, want invalid allow-symlink-root error")
			}
		})
	}
}

func TestParseArgsRejectsNonPositiveMaxDirEntries(t *testing.T) {
	for _, input := range []string{"0", "-1"} {
		t.Run(input, func(t *testing.T) {
			_, err := ParseArgs([]string{"/workspace", "--max-dir-entries", input})
			if err == nil {
				t.Fatal("ParseArgs() error = nil, want non-positive max-dir-entries error")
			}
		})
	}
}
