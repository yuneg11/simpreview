package files

import (
	stdmime "mime"
	"net/http"
	"path/filepath"
	"strings"
)

type RenderMode string

const (
	RenderModeMarkdown RenderMode = "markdown"
	RenderModeSource   RenderMode = "source"
	RenderModeText     RenderMode = "text"
	RenderModeBinary   RenderMode = "binary"
)

var markdownExtensions = map[string]struct{}{
	".md":       {},
	".markdown": {},
	".mdown":    {},
}

var sourceExtensions = map[string]struct{}{
	".go":   {},
	".js":   {},
	".ts":   {},
	".tsx":  {},
	".jsx":  {},
	".json": {},
	".yaml": {},
	".yml":  {},
	".toml": {},
	".sh":   {},
	".css":  {},
	".html": {},
	".xml":  {},
	".svg":  {},
	".sql":  {},
	".rs":   {},
	".java": {},
	".py":   {},
	".c":    {},
	".h":    {},
	".cpp":  {},
	".hpp":  {},
}

var textExtensions = map[string]struct{}{
	".txt": {},
	".log": {},
	".csv": {},
}

func DetectRenderMode(name string, sample []byte) (RenderMode, string) {
	ext := strings.ToLower(filepath.Ext(name))
	mimeType := mimeForExtension(ext)
	if mimeType == "" {
		mimeType = http.DetectContentType(sample)
	}

	if _, ok := markdownExtensions[ext]; ok {
		return RenderModeMarkdown, mimeType
	}
	if _, ok := sourceExtensions[ext]; ok {
		return RenderModeSource, mimeType
	}
	if _, ok := textExtensions[ext]; ok {
		return RenderModeText, mimeType
	}
	if strings.HasPrefix(baseMIMEType(mimeType), "text/") {
		return RenderModeText, mimeType
	}
	return RenderModeBinary, mimeType
}

func DetectRawMIME(name string, sample []byte) string {
	ext := strings.ToLower(filepath.Ext(name))
	extensionMIME := mimeForExtension(ext)
	extensionBase := baseMIMEType(extensionMIME)
	sniffedMIME := http.DetectContentType(sample)
	sniffedBase := baseMIMEType(sniffedMIME)

	if isActiveMIME(sniffedBase) {
		return sniffedMIME
	}
	if isActiveExtension(ext) || isActiveMIME(extensionBase) {
		if extensionMIME != "" {
			return extensionMIME
		}
		return sniffedMIME
	}
	if isSafeInlineBinaryMIME(sniffedBase) {
		return sniffedMIME
	}
	if sniffedBase == "text/plain" {
		return "text/plain; charset=utf-8"
	}
	if sniffedBase != "" && sniffedBase != "application/octet-stream" {
		return sniffedMIME
	}
	if extensionBase == "text/plain" {
		return extensionMIME
	}
	return "application/octet-stream"
}

func RawDisposition(name string, mimeType string) string {
	ext := strings.ToLower(filepath.Ext(name))
	base := baseMIMEType(mimeType)

	if isActiveExtension(ext) || isActiveMIME(base) {
		return "attachment"
	}
	if base == "text/plain" || base == "image/png" || base == "image/jpeg" || base == "image/gif" || base == "application/pdf" {
		return "inline"
	}
	return "attachment"
}

func mimeForExtension(ext string) string {
	switch ext {
	case ".md", ".markdown", ".mdown":
		return "text/markdown; charset=utf-8"
	case ".go", ".ts", ".tsx", ".jsx", ".toml", ".sh", ".sql", ".rs", ".java", ".py", ".c", ".h", ".cpp", ".hpp":
		return "text/plain; charset=utf-8"
	case ".js":
		return "text/javascript; charset=utf-8"
	case ".json":
		return "application/json"
	case ".yaml", ".yml":
		return "application/yaml"
	case ".css":
		return "text/css; charset=utf-8"
	case ".html":
		return "text/html; charset=utf-8"
	case ".xml":
		return "application/xml"
	case ".svg":
		return "image/svg+xml"
	case ".txt", ".log":
		return "text/plain; charset=utf-8"
	case ".csv":
		return "text/csv; charset=utf-8"
	}

	if ext == "" {
		return ""
	}
	return stdmime.TypeByExtension(ext)
}

func baseMIMEType(value string) string {
	base, _, err := stdmime.ParseMediaType(value)
	if err != nil {
		base = strings.Split(value, ";")[0]
	}
	return strings.ToLower(strings.TrimSpace(base))
}

func isActiveExtension(ext string) bool {
	switch ext {
	case ".html", ".htm", ".svg", ".xml", ".js", ".mjs", ".xhtml":
		return true
	default:
		return false
	}
}

func isSafeInlineBinaryMIME(base string) bool {
	switch base {
	case "image/png", "image/jpeg", "image/gif", "application/pdf":
		return true
	default:
		return false
	}
}

func isActiveMIME(base string) bool {
	switch base {
	case "text/html",
		"image/svg+xml",
		"application/xml",
		"text/xml",
		"application/xhtml+xml",
		"text/javascript",
		"application/javascript",
		"application/x-javascript",
		"text/ecmascript",
		"application/ecmascript":
		return true
	default:
		return false
	}
}
