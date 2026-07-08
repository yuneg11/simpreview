package assets

import (
	"embed"
	"io/fs"
)

//go:embed web/*
var webDist embed.FS

func WebDist() (fs.FS, error) {
	return fs.Sub(webDist, "web")
}
