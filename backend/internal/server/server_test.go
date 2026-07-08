package server

import (
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"

	"preview/backend/internal/files"
)

func TestAPIReturnsDirectoryJSONForRoot(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "README.md"), "# Preview\n")
	mustMkdir(t, filepath.Join(root, "docs"))
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodGet, "/-/api/fs/")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusOK, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}

	var body struct {
		Kind    string `json:"kind"`
		Path    string `json:"path"`
		Entries []struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
		} `json:"entries"`
	}
	decodeJSON(t, response, &body)
	if body.Kind != "directory" {
		t.Fatalf("kind = %q, want directory", body.Kind)
	}
	if body.Path != "" {
		t.Fatalf("path = %q, want root path", body.Path)
	}
	if !hasEntry(body.Entries, "docs", "directory") {
		t.Fatalf("entries = %#v, want docs directory", body.Entries)
	}
	if !hasEntry(body.Entries, "README.md", "file") {
		t.Fatalf("entries = %#v, want README.md file", body.Entries)
	}
}

func TestAPIReturnsDirectoryJSONWithoutTrailingSlash(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "docs", "guide.md"), "# Guide\n")
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodGet, "/-/api/fs/docs")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusOK, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}

	var body struct {
		Kind    string `json:"kind"`
		Path    string `json:"path"`
		Entries []struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
		} `json:"entries"`
	}
	decodeJSON(t, response, &body)
	if body.Kind != "directory" {
		t.Fatalf("kind = %q, want directory", body.Kind)
	}
	if body.Path != "docs" {
		t.Fatalf("path = %q, want docs", body.Path)
	}
	if !hasEntry(body.Entries, "guide.md", "file") {
		t.Fatalf("entries = %#v, want guide.md file", body.Entries)
	}
}

func TestAPIReturnsFileJSONForMarkdownPreview(t *testing.T) {
	root := t.TempDir()
	content := "# Preview\n\nMarkdown body.\n"
	writeFile(t, filepath.Join(root, "README.md"), content)
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodGet, "/-/api/fs/README.md")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusOK, response.Body.String())
	}

	var body struct {
		Kind       string `json:"kind"`
		Path       string `json:"path"`
		RenderMode string `json:"renderMode"`
		Content    string `json:"content"`
		RawURL     string `json:"rawURL"`
	}
	decodeJSON(t, response, &body)
	if body.Kind != "file" {
		t.Fatalf("kind = %q, want file", body.Kind)
	}
	if body.Path != "README.md" {
		t.Fatalf("path = %q, want README.md", body.Path)
	}
	if body.RenderMode != "markdown" {
		t.Fatalf("renderMode = %q, want markdown", body.RenderMode)
	}
	if body.Content != content {
		t.Fatalf("content = %q, want %q", body.Content, content)
	}
	if body.RawURL != "/-/raw/README.md" {
		t.Fatalf("rawURL = %q, want /-/raw/README.md", body.RawURL)
	}
}

func TestRawHTMLForcesAttachmentAndNoSniff(t *testing.T) {
	root := t.TempDir()
	content := "<!doctype html><title>raw</title>"
	writeFile(t, filepath.Join(root, "index.html"), content)
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodGet, "/-/raw/index.html")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusOK, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", got)
	}
	if got := response.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") {
		t.Fatalf("Content-Disposition = %q, want attachment", got)
	}
	if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if got, want := response.Header().Get("Content-Length"), strconv.Itoa(len(content)); got != want {
		t.Fatalf("Content-Length = %q, want %s", got, want)
	}
	if response.Body.String() != content {
		t.Fatalf("body = %q, want %q", response.Body.String(), content)
	}
}

func TestBareMissingPathReturnsSPAShell(t *testing.T) {
	root := t.TempDir()
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodGet, "/docs/missing")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusOK, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "preview") {
		t.Fatalf("body = %q, want SPA shell containing preview", response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
}

func TestUnsupportedMethodsReturn405(t *testing.T) {
	root := t.TempDir()
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodPost, "/-/api/fs/")

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
	if got := response.Header().Get("Allow"); got != "GET, HEAD" {
		t.Fatalf("Allow = %q, want GET, HEAD", got)
	}
}

func TestReservedRouteUnsupportedMethodsReturnJSONEnvelope(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "README.md"), "# Preview\n")
	assets := testAssets()
	assets["assets/app.js"] = &fstest.MapFile{Data: []byte("console.log('preview');")}
	handler := newTestHandler(t, root, assets)

	tests := []struct {
		name   string
		target string
	}{
		{name: "api", target: "/-/api/fs/"},
		{name: "raw", target: "/-/raw/README.md"},
		{name: "asset", target: "/-/assets/app.js"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := serve(handler, http.MethodPost, tt.target)

			if response.Code != http.StatusMethodNotAllowed {
				t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
			}
			if got := response.Header().Get("Allow"); got != "GET, HEAD" {
				t.Fatalf("Allow = %q, want GET, HEAD", got)
			}
			if got := response.Header().Get("Content-Type"); got != "application/json" {
				t.Fatalf("Content-Type = %q, want application/json", got)
			}

			var body struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			decodeJSON(t, response, &body)
			if body.Error.Code != "method_not_allowed" {
				t.Fatalf("error.code = %q, want method_not_allowed", body.Error.Code)
			}
			if body.Error.Message == "" {
				t.Fatal("error.message is empty")
			}
		})
	}
}

func TestSecurityHeadersExist(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "README.md"), "# Preview\n")
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodGet, "/-/api/fs/README.md")

	if got := response.Header().Get("Content-Security-Policy"); got == "" {
		t.Fatal("Content-Security-Policy header is empty")
	}
	if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}
	if got := response.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Fatalf("Referrer-Policy = %q, want no-referrer", got)
	}
}

func TestHEADOnRawReturnsHeadersWithoutBody(t *testing.T) {
	root := t.TempDir()
	content := "<!doctype html><title>raw</title>"
	writeFile(t, filepath.Join(root, "index.html"), content)
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodHead, "/-/raw/index.html")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if got, want := response.Header().Get("Content-Length"), strconv.Itoa(len(content)); got != want {
		t.Fatalf("Content-Length = %q, want %s", got, want)
	}
	if got := response.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment") {
		t.Fatalf("Content-Disposition = %q, want attachment", got)
	}
	if response.Body.Len() != 0 {
		t.Fatalf("body length = %d, want 0", response.Body.Len())
	}
}

func TestJSONErrorsUseEnvelopeAndStatus(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".secret", "note.md"), "hidden")
	handler := newTestHandler(t, root, testAssets())

	response := serve(handler, http.MethodGet, "/-/api/fs/.secret/note.md")

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusForbidden, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}

	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	decodeJSON(t, response, &body)
	if body.Error.Code != "forbidden" {
		t.Fatalf("error.code = %q, want forbidden", body.Error.Code)
	}
	if body.Error.Message == "" {
		t.Fatal("error.message is empty")
	}
}

func TestAssetsRouteServesFilesFromFS(t *testing.T) {
	root := t.TempDir()
	assets := testAssets()
	assets["assets/app.js"] = &fstest.MapFile{Data: []byte("console.log('preview');")}
	handler := newTestHandler(t, root, assets)

	response := serve(handler, http.MethodGet, "/-/assets/app.js")

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusOK, response.Body.String())
	}
	if response.Body.String() != "console.log('preview');" {
		t.Fatalf("body = %q, want fake asset", response.Body.String())
	}
}

func TestAssetsRouteRejectsExactDirectoryRequests(t *testing.T) {
	root := t.TempDir()
	assets := testAssets()
	assets["assets/app.js"] = &fstest.MapFile{Data: []byte("console.log('preview');")}
	handler := newTestHandler(t, root, assets)

	for _, target := range []string{"/-/assets", "/-/assets/"} {
		t.Run(target, func(t *testing.T) {
			response := serve(handler, http.MethodGet, target)

			if response.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusNotFound, response.Body.String())
			}
			if strings.Contains(response.Body.String(), "app.js") {
				t.Fatalf("body = %q, want no directory listing", response.Body.String())
			}
		})
	}
}

func TestAssetsRouteRejectsNestedDirectoryRequests(t *testing.T) {
	root := t.TempDir()
	assets := testAssets()
	assets["assets/chunks/app.js"] = &fstest.MapFile{Data: []byte("console.log('preview');")}
	handler := newTestHandler(t, root, slashTolerantMapFS{MapFS: assets})

	response := serve(handler, http.MethodGet, "/-/assets/chunks/")

	if response.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d; body=%s", response.Code, http.StatusNotFound, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "app.js") {
		t.Errorf("body = %q, want no directory listing", response.Body.String())
	}
}

func TestDevModeServesAPIWithoutEmbeddedShellOrAssets(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "README.md"), "# Preview\n")
	assets := testAssets()
	assets["assets/app.js"] = &fstest.MapFile{Data: []byte("console.log('preview');")}
	handler := newTestHandlerWithOptions(t, root, assets, Options{Dev: true})

	apiResponse := serve(handler, http.MethodGet, "/-/api/fs/")
	if apiResponse.Code != http.StatusOK {
		t.Fatalf("API status = %d, want %d; body=%s", apiResponse.Code, http.StatusOK, apiResponse.Body.String())
	}
	if got := apiResponse.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("API Content-Type = %q, want application/json", got)
	}

	rawResponse := serve(handler, http.MethodGet, "/-/raw/README.md")
	if rawResponse.Code != http.StatusOK {
		t.Fatalf("raw status = %d, want %d; body=%s", rawResponse.Code, http.StatusOK, rawResponse.Body.String())
	}
	if rawResponse.Body.String() != "# Preview\n" {
		t.Fatalf("raw body = %q, want README contents", rawResponse.Body.String())
	}

	shellResponse := serve(handler, http.MethodGet, "/anything")
	if shellResponse.Code != http.StatusNotFound {
		t.Fatalf("shell status = %d, want %d; body=%s", shellResponse.Code, http.StatusNotFound, shellResponse.Body.String())
	}
	if strings.Contains(shellResponse.Body.String(), "preview") {
		t.Fatalf("shell body = %q, want no embedded SPA shell", shellResponse.Body.String())
	}
	if got := shellResponse.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("shell Cache-Control = %q, want no-store", got)
	}

	assetResponse := serve(handler, http.MethodGet, "/-/assets/app.js")
	if assetResponse.Code != http.StatusNotFound {
		t.Fatalf("asset status = %d, want %d; body=%s", assetResponse.Code, http.StatusNotFound, assetResponse.Body.String())
	}
	if strings.Contains(assetResponse.Body.String(), "console.log") {
		t.Fatalf("asset body = %q, want no embedded asset", assetResponse.Body.String())
	}
}

func newTestHandler(t *testing.T, root string, assets fs.FS) http.Handler {
	t.Helper()

	return newTestHandlerWithOptions(t, root, assets, Options{})
}

func newTestHandlerWithOptions(t *testing.T, root string, assets fs.FS, opts Options) http.Handler {
	t.Helper()

	store, err := files.NewStore(files.Policy{
		Root:           root,
		MaxPreviewSize: 1024 * 1024,
		MaxRawFileSize: 1024 * 1024,
		MaxDirEntries:  100,
	})
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	return New(store, assets, opts)
}

// slashTolerantMapFS models filesystems like os.DirFS that open directory paths
// even when ServeFileFS passes a trailing slash.
type slashTolerantMapFS struct {
	fstest.MapFS
}

func (fsys slashTolerantMapFS) Open(name string) (fs.File, error) {
	name = strings.TrimRight(name, "/")
	if name == "" {
		name = "."
	}
	return fsys.MapFS.Open(name)
}

func testAssets() fstest.MapFS {
	return fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html><title>preview</title><div id=\"app\">preview</div>")},
	}
}

func serve(handler http.Handler, method string, target string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func decodeJSON(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()

	result := response.Result()
	defer result.Body.Close()
	body, err := io.ReadAll(result.Body)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if err := json.Unmarshal(body, target); err != nil {
		t.Fatalf("json.Unmarshal(%q) error = %v", string(body), err)
	}
}

func writeFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func mustMkdir(t *testing.T, path string) {
	t.Helper()

	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
}

func hasEntry(entries []struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}, name string, kind string) bool {
	for _, entry := range entries {
		if entry.Name == name && entry.Kind == kind {
			return true
		}
	}
	return false
}
