package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"preview/backend/internal/assets"
	"preview/backend/internal/config"
	"preview/backend/internal/files"
	"preview/backend/internal/server"
)

func main() {
	cfg, err := config.ParseArgs(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	warnIfNonLocalhost(cfg.Addr)

	store, err := files.NewStore(files.Policy{
		Root:                cfg.Root,
		ShowHidden:          cfg.ShowHidden,
		AllowedSymlinkRoots: cfg.AllowedSymlinkRoots,
		MaxPreviewSize:      cfg.MaxPreviewSize,
		MaxRawFileSize:      cfg.MaxRawFileSize,
		MaxDirEntries:       cfg.MaxDirEntries,
	})
	if err != nil {
		log.Fatal(err)
	}

	webDist, err := assets.WebDist()
	if err != nil {
		log.Fatal(err)
	}

	handler := server.New(store, webDist, server.Options{Dev: cfg.Dev})
	log.Print(startupMessage(cfg.Root, cfg.Addr))
	if err := http.ListenAndServe(cfg.Addr, handler); err != nil {
		log.Fatal(err)
	}
}

func warnIfNonLocalhost(addr string) {
	if !shouldWarnNonLocalhost(addr) {
		return
	}
	log.Printf("warning: listening on non-localhost address %q; readable/local files may be exposed to the reachable network", addr)
}

func shouldWarnNonLocalhost(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	if host == "localhost" {
		return false
	}

	ip := net.ParseIP(host)
	return ip == nil || !ip.IsLoopback()
}

func startupMessage(root string, addr string) string {
	return fmt.Sprintf("serving %s at http://%s", root, addr)
}
