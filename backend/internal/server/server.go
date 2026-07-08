package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"simpreview/backend/internal/files"
)

type Options struct {
	Dev bool
}

func New(store *files.Store, assets fs.FS, opts Options) http.Handler {
	return &handler{
		store:  store,
		assets: assets,
		opts:   opts,
	}
}

type handler struct {
	store  *files.Store
	assets fs.FS
	opts   Options
}

type errorEnvelope struct {
	Error errorPayload `json:"error"`
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

const contentSecurityPolicy = "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	setSecurityHeaders(w.Header())

	requestPath := r.URL.EscapedPath()
	isAPIRequest := requestPath == "/-/api/fs" || strings.HasPrefix(requestPath, "/-/api/fs/")
	isRawRequest := requestPath == "/-/raw" || strings.HasPrefix(requestPath, "/-/raw/")
	isAssetRequest := requestPath == "/-/assets" || strings.HasPrefix(requestPath, "/-/assets/")
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		h.serveMethodNotAllowed(w, r, isAPIRequest || isRawRequest || isAssetRequest)
		return
	}

	switch {
	case isAPIRequest:
		h.serveAPI(w, r, routeSuffix(requestPath, "/-/api/fs"))
	case isRawRequest:
		h.serveRaw(w, r, routeSuffix(requestPath, "/-/raw"))
	case isAssetRequest:
		h.serveAsset(w, r)
	default:
		h.serveShell(w, r)
	}
}

func (h *handler) serveMethodNotAllowed(w http.ResponseWriter, r *http.Request, jsonEnvelope bool) {
	w.Header().Set("Allow", "GET, HEAD")
	w.Header().Set("Cache-Control", "no-store")
	if jsonEnvelope {
		writeJSON(w, r, http.StatusMethodNotAllowed, errorEnvelope{
			Error: errorPayload{
				Code:    "method_not_allowed",
				Message: http.StatusText(http.StatusMethodNotAllowed),
			},
		})
		return
	}
	http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
}

func (h *handler) serveAPI(w http.ResponseWriter, r *http.Request, rawPath string) {
	if rawPath == "" || strings.HasSuffix(rawPath, "/") {
		directory, err := h.store.List(strings.TrimSuffix(rawPath, "/"))
		if err != nil {
			writeStoreError(w, r, err)
			return
		}
		writeJSON(w, r, http.StatusOK, directory)
		return
	}

	directory, err := h.store.List(rawPath)
	if err == nil {
		writeJSON(w, r, http.StatusOK, directory)
		return
	}
	if !isUnsupportedStoreError(err) {
		writeStoreError(w, r, err)
		return
	}

	file, err := h.store.ReadPreview(rawPath)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, file)
}

func isUnsupportedStoreError(err error) bool {
	var value files.AppError
	if errors.As(err, &value) {
		return value.Code == files.CodeUnsupported
	}

	var pointer *files.AppError
	return errors.As(err, &pointer) && pointer != nil && pointer.Code == files.CodeUnsupported
}

func (h *handler) serveRaw(w http.ResponseWriter, r *http.Request, rawPath string) {
	raw, err := h.store.OpenRaw(rawPath)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	defer raw.Reader.Close()

	if raw.MIME != "" {
		w.Header().Set("Content-Type", raw.MIME)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	w.Header().Set("Content-Length", strconv.FormatInt(raw.Size, 10))
	w.Header().Set("Content-Disposition", formatContentDisposition(raw))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)

	if r.Method == http.MethodHead {
		return
	}
	_, _ = io.Copy(w, raw.Reader)
}

func (h *handler) serveAsset(w http.ResponseWriter, r *http.Request) {
	if h.opts.Dev {
		writeNoStoreNotFound(w, r)
		return
	}
	if r.URL.Path == "/-/assets" || r.URL.Path == "/-/assets/" {
		writeNoStoreNotFound(w, r)
		return
	}
	assetPath := strings.TrimPrefix(r.URL.Path, "/-/")
	if info, err := fs.Stat(h.assets, strings.TrimRight(assetPath, "/")); err == nil && info.IsDir() {
		writeNoStoreNotFound(w, r)
		return
	}
	http.ServeFileFS(w, r, h.assets, assetPath)
}

func (h *handler) serveShell(w http.ResponseWriter, r *http.Request) {
	if h.opts.Dev {
		writeNoStoreNotFound(w, r)
		return
	}

	document, err := fs.ReadFile(h.assets, "index.html")
	if err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Length", strconv.Itoa(len(document)))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(document)
}

func writeNoStoreNotFound(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
}

func writeJSON(w http.ResponseWriter, r *http.Request, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func writeStoreError(w http.ResponseWriter, r *http.Request, err error) {
	appErr := files.AppError{Code: files.CodeInternal, Message: http.StatusText(http.StatusInternalServerError)}
	var candidate files.AppError
	if errors.As(err, &candidate) {
		appErr = candidate
	} else if err != nil {
		appErr.Message = err.Error()
	}

	if appErr.Code == "" {
		appErr.Code = files.CodeInternal
	}
	if appErr.Message == "" {
		appErr.Message = appErr.Error()
	}

	writeJSON(w, r, files.Status(err), errorEnvelope{
		Error: errorPayload{
			Code:    string(appErr.Code),
			Message: appErr.Message,
		},
	})
}

func setSecurityHeaders(header http.Header) {
	header.Set("Content-Security-Policy", contentSecurityPolicy)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Referrer-Policy", "no-referrer")
}

func routeSuffix(requestPath string, prefix string) string {
	if requestPath == prefix {
		return ""
	}
	return strings.TrimPrefix(requestPath, prefix+"/")
}

func formatContentDisposition(raw files.RawFile) string {
	if raw.Disposition == "" {
		return ""
	}
	formatted := mime.FormatMediaType(raw.Disposition, map[string]string{"filename": raw.Name})
	if formatted == "" {
		return raw.Disposition
	}
	return formatted
}
