package config

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
)

const (
	defaultAddr           = "127.0.0.1:8080"
	defaultMaxPreviewSize = 2 * 1024 * 1024
	defaultMaxRawFileSize = 100 * 1024 * 1024
	defaultMaxDirEntries  = 5000
)

type Config struct {
	Root                string
	Addr                string
	ShowHidden          bool
	AllowedSymlinkRoots []string
	MaxPreviewSize      int64
	MaxRawFileSize      int64
	MaxDirEntries       int
	Dev                 bool
}

func Default() Config {
	return Config{
		Addr:           defaultAddr,
		MaxPreviewSize: defaultMaxPreviewSize,
		MaxRawFileSize: defaultMaxRawFileSize,
		MaxDirEntries:  defaultMaxDirEntries,
	}
}

func ParseSize(input string) (int64, error) {
	if input == "" {
		return 0, errors.New("size must not be empty")
	}
	if strings.ContainsAny(input, " \t\r\n") {
		return 0, fmt.Errorf("invalid size %q: spaces are not allowed", input)
	}

	number := input
	multiplier := int64(1)
	lower := strings.ToLower(input)
	for _, unit := range []struct {
		suffix     string
		multiplier int64
	}{
		{suffix: "kb", multiplier: 1024},
		{suffix: "mb", multiplier: 1024 * 1024},
		{suffix: "gb", multiplier: 1024 * 1024 * 1024},
	} {
		if strings.HasSuffix(lower, unit.suffix) {
			number = input[:len(input)-len(unit.suffix)]
			multiplier = unit.multiplier
			break
		}
	}

	if number == "" {
		return 0, fmt.Errorf("invalid size %q", input)
	}
	for _, r := range number {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("invalid size %q", input)
		}
	}

	value, err := strconv.ParseInt(number, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid size %q: %w", input, err)
	}
	if value <= 0 {
		return 0, fmt.Errorf("size must be positive: %q", input)
	}
	if value > math.MaxInt64/multiplier {
		return 0, fmt.Errorf("size overflows int64: %q", input)
	}

	return value * multiplier, nil
}

func ParseArgs(args []string) (Config, error) {
	cfg := Default()
	var allowedSymlinkRoots repeatableStringFlag
	var maxPreviewSize string
	var maxRawFileSize string

	flags := flag.NewFlagSet("simpreview", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&cfg.Addr, "addr", cfg.Addr, "address to listen on")
	flags.BoolVar(&cfg.ShowHidden, "show-hidden", cfg.ShowHidden, "show hidden files")
	flags.Var(&allowedSymlinkRoots, "allow-symlink-root", "allowed symlink root")
	flags.StringVar(&maxPreviewSize, "max-preview-size", "2MB", "maximum preview size")
	flags.StringVar(&maxRawFileSize, "max-raw-file-size", "100MB", "maximum raw file size")
	flags.IntVar(&cfg.MaxDirEntries, "max-dir-entries", cfg.MaxDirEntries, "maximum directory entries")
	flags.BoolVar(&cfg.Dev, "dev", cfg.Dev, "enable development mode")

	// The root directory is a positional argument. flag.Parse stops at the first
	// non-flag token, so consume the positional and resume parsing the remainder;
	// this accepts the directory before, between, or after flags.
	var positionals []string
	rest := args
	for {
		if err := flags.Parse(rest); err != nil {
			return Config{}, err
		}
		if flags.NArg() == 0 {
			break
		}
		positionals = append(positionals, flags.Arg(0))
		rest = flags.Args()[1:]
	}
	switch {
	case len(positionals) == 0:
		return Config{}, errors.New("root directory is required (usage: simpreview [flags] <dir>)")
	case len(positionals) > 1:
		return Config{}, fmt.Errorf("unexpected extra argument %q", positionals[1])
	}
	cfg.Root = positionals[0]
	if strings.TrimSpace(cfg.Root) == "" {
		return Config{}, errors.New("root directory must not be empty")
	}

	parsedMaxPreviewSize, err := ParseSize(maxPreviewSize)
	if err != nil {
		return Config{}, fmt.Errorf("--max-preview-size: %w", err)
	}
	parsedMaxRawFileSize, err := ParseSize(maxRawFileSize)
	if err != nil {
		return Config{}, fmt.Errorf("--max-raw-file-size: %w", err)
	}
	if cfg.MaxDirEntries <= 0 {
		return Config{}, errors.New("--max-dir-entries must be positive")
	}

	cfg.AllowedSymlinkRoots = []string(allowedSymlinkRoots)
	cfg.MaxPreviewSize = parsedMaxPreviewSize
	cfg.MaxRawFileSize = parsedMaxRawFileSize

	return cfg, nil
}

type repeatableStringFlag []string

func (f *repeatableStringFlag) String() string {
	return strings.Join(*f, ",")
}

func (f *repeatableStringFlag) Set(value string) error {
	if strings.TrimSpace(value) == "" {
		return errors.New("value must not be empty")
	}
	*f = append(*f, value)
	return nil
}
