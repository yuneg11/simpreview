package files

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestListHidesDotfilesAndSortsDirectoriesFirst(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "z.txt"), "z")
	writeFile(t, filepath.Join(root, "a.txt"), "a")
	writeFile(t, filepath.Join(root, ".env"), "hidden")
	mustMkdir(t, filepath.Join(root, "beta"))
	mustMkdir(t, filepath.Join(root, "alpha"))

	store := newTestStore(t, Policy{Root: root})

	got, err := store.List("")
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if got.Kind != "directory" {
		t.Fatalf("Kind = %q, want directory", got.Kind)
	}
	if got.Path != "" {
		t.Fatalf("Path = %q, want root path", got.Path)
	}
	if got.CanonicalPath != root {
		t.Fatalf("CanonicalPath = %q, want %q", got.CanonicalPath, root)
	}

	wantNames := []string{"alpha", "beta", "a.txt", "z.txt"}
	if gotNames := entryNames(got.Entries); !reflect.DeepEqual(gotNames, wantNames) {
		t.Fatalf("entry names = %v, want %v", gotNames, wantNames)
	}
	if got.Entries[0].Kind != "directory" || got.Entries[1].Kind != "directory" {
		t.Fatalf("first entries kinds = %q, %q; want directories first", got.Entries[0].Kind, got.Entries[1].Kind)
	}
	if containsEntry(got.Entries, ".env") {
		t.Fatal("List() included hidden dot entry with ShowHidden=false")
	}
}

func TestListReportsTruncation(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "a.txt"), "a")
	writeFile(t, filepath.Join(root, "b.txt"), "b")
	writeFile(t, filepath.Join(root, "c.txt"), "c")

	store := newTestStore(t, Policy{Root: root, MaxDirEntries: 2})

	got, err := store.List("")
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !got.Truncated {
		t.Fatal("Truncated = false, want true")
	}
	if len(got.Entries) != 2 {
		t.Fatalf("len(Entries) = %d, want 2", len(got.Entries))
	}
}

func TestListCapsLargeDirectoryAtMaxEntries(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < 25; i++ {
		writeFile(t, filepath.Join(root, "file-"+string(rune('a'+i))+".txt"), "x")
	}

	store := newTestStore(t, Policy{Root: root, MaxDirEntries: 5})

	got, err := store.List("")
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !got.Truncated {
		t.Fatal("Truncated = false, want true")
	}
	if len(got.Entries) != 5 {
		t.Fatalf("len(Entries) = %d, want 5", len(got.Entries))
	}
}

func TestListHandlesDecodedPercentNames(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "100%.txt"), "a")
	store := newTestStore(t, Policy{Root: root})

	got, err := store.List("")
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if gotNames := entryNames(got.Entries); !reflect.DeepEqual(gotNames, []string{"100%.txt"}) {
		t.Fatalf("entry names = %v, want [100%%.txt]", gotNames)
	}
	if got.Entries[0].Path != "100%.txt" {
		t.Fatalf("entry path = %q, want 100%%.txt", got.Entries[0].Path)
	}
}

func TestReadPreviewReturnsDownloadNodeWhenTooLarge(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "large.txt"), "abcd")
	store := newTestStore(t, Policy{Root: root, MaxPreviewSize: 3, MaxRawFileSize: 1024})

	got, err := store.ReadPreview("large.txt")
	if err != nil {
		t.Fatalf("ReadPreview() error = %v", err)
	}
	if !got.TooLarge {
		t.Fatalf("TooLarge = false, want true for oversized preview")
	}
	if got.Content != "" {
		t.Fatalf("Content = %q, want empty content for too-large preview", got.Content)
	}
	if got.RawURL != "/-/raw/large.txt" {
		t.Fatalf("RawURL = %q, want /-/raw/large.txt", got.RawURL)
	}
	if got.Size != 4 {
		t.Fatalf("Size = %d, want 4", got.Size)
	}
}

func TestReadPreviewReturnsNotFoundForMissingFile(t *testing.T) {
	root := t.TempDir()
	store := newTestStore(t, Policy{Root: root})

	_, err := store.ReadPreview("missing.txt")
	if Status(err) != http.StatusNotFound {
		t.Fatalf("ReadPreview() status = %d, want %d (err=%v)", Status(err), http.StatusNotFound, err)
	}
}

func TestReadPreviewRejectsDirectory(t *testing.T) {
	root := t.TempDir()
	mustMkdir(t, filepath.Join(root, "docs"))
	store := newTestStore(t, Policy{Root: root})

	_, err := store.ReadPreview("docs")
	if Status(err) != http.StatusUnsupportedMediaType {
		t.Fatalf("ReadPreview() status = %d, want %d (err=%v)", Status(err), http.StatusUnsupportedMediaType, err)
	}
}

func TestReadPreviewEnforcesLimitWhileReadingOpenedFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	procFile := "/proc/self/cmdline"
	info, err := os.Stat(procFile)
	if err != nil {
		t.Skipf("%s unavailable: %v", procFile, err)
	}
	if !info.Mode().IsRegular() || info.Size() != 0 {
		t.Skipf("%s is not a zero-size regular proc file", procFile)
	}

	root := t.TempDir()
	mustSymlink(t, procFile, filepath.Join(root, "cmd.txt"))
	store := newTestStore(t, Policy{
		Root:                root,
		AllowedSymlinkRoots: []string{filepath.Dir(procFile)},
		MaxPreviewSize:      1,
	})

	_, err = store.ReadPreview("cmd.txt")
	if Status(err) != http.StatusRequestEntityTooLarge {
		t.Fatalf("ReadPreview() status = %d, want %d (err=%v)", Status(err), http.StatusRequestEntityTooLarge, err)
	}
}

func TestReadPreviewReturnsMarkdownContent(t *testing.T) {
	root := t.TempDir()
	content := "# Title\n\nBody\n"
	writeFile(t, filepath.Join(root, "README.md"), content)
	store := newTestStore(t, Policy{Root: root, MaxPreviewSize: 1024})

	got, err := store.ReadPreview("README.md")
	if err != nil {
		t.Fatalf("ReadPreview() error = %v", err)
	}
	if got.Kind != "file" {
		t.Fatalf("Kind = %q, want file", got.Kind)
	}
	if got.Path != "README.md" {
		t.Fatalf("Path = %q, want README.md", got.Path)
	}
	if got.CanonicalPath != filepath.Join(root, "README.md") {
		t.Fatalf("CanonicalPath = %q, want file path", got.CanonicalPath)
	}
	if got.RenderMode != RenderModeMarkdown {
		t.Fatalf("RenderMode = %q, want %q", got.RenderMode, RenderModeMarkdown)
	}
	if got.Content != content {
		t.Fatalf("Content = %v, want %q", got.Content, content)
	}
	if got.RawURL != "/-/raw/README.md" {
		t.Fatalf("RawURL = %q, want /-/raw/README.md", got.RawURL)
	}
}

func TestReadPreviewEscapesRawURLPerPathSegment(t *testing.T) {
	root := t.TempDir()
	content := "percent file\n"
	writeFile(t, filepath.Join(root, "space dir", "100%.txt"), content)
	store := newTestStore(t, Policy{Root: root, MaxPreviewSize: 1024})

	got, err := store.ReadPreview("space%20dir/100%25.txt")
	if err != nil {
		t.Fatalf("ReadPreview() error = %v", err)
	}
	if got.Path != "space dir/100%.txt" {
		t.Fatalf("Path = %q, want space dir/100%%.txt", got.Path)
	}
	if got.Content != content {
		t.Fatalf("Content = %q, want %q", got.Content, content)
	}
	if got.RawURL != "/-/raw/space%20dir/100%25.txt" {
		t.Fatalf("RawURL = %q, want /-/raw/space%%20dir/100%%25.txt", got.RawURL)
	}
}

func TestReadPreviewReturnsBinaryMetadataWithoutContent(t *testing.T) {
	root := t.TempDir()
	writeBytes(t, filepath.Join(root, "image.png"), testPNGBytes())
	store := newTestStore(t, Policy{Root: root, MaxPreviewSize: 1024})

	got, err := store.ReadPreview("image.png")
	if err != nil {
		t.Fatalf("ReadPreview() error = %v", err)
	}
	if got.RenderMode != RenderModeBinary {
		t.Fatalf("RenderMode = %q, want %q", got.RenderMode, RenderModeBinary)
	}
	if base := baseMediaType(t, got.MIME); base != "image/png" {
		t.Fatalf("MIME = %q, want image/png", got.MIME)
	}
	if got.Content != "" {
		t.Fatalf("Content = %q, want empty content for binary preview", got.Content)
	}
	body, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if containsJSONField(body, "content") {
		t.Fatalf("marshaled binary preview included content field: %s", body)
	}
}

func TestOpenRawRejectsOversizedFiles(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "large.txt"), "abcd")
	store := newTestStore(t, Policy{Root: root, MaxRawFileSize: 3})

	_, err := store.OpenRaw("large.txt")
	if Status(err) != http.StatusRequestEntityTooLarge {
		t.Fatalf("OpenRaw() status = %d, want %d (err=%v)", Status(err), http.StatusRequestEntityTooLarge, err)
	}
}

func TestOpenRawRejectsDirectory(t *testing.T) {
	root := t.TempDir()
	mustMkdir(t, filepath.Join(root, "docs"))
	store := newTestStore(t, Policy{Root: root})

	_, err := store.OpenRaw("docs")
	if Status(err) != http.StatusUnsupportedMediaType {
		t.Fatalf("OpenRaw() status = %d, want %d (err=%v)", Status(err), http.StatusUnsupportedMediaType, err)
	}
}

func TestOpenRawReaderDoesNotStreamFileGrowthAfterOpen(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "grow.txt")
	writeFile(t, path, "abc")
	store := newTestStore(t, Policy{Root: root, MaxRawFileSize: 3})

	got, err := store.OpenRaw("grow.txt")
	if err != nil {
		t.Fatalf("OpenRaw() error = %v", err)
	}
	defer got.Reader.Close()

	appendFile(t, path, "def")

	body, err := io.ReadAll(got.Reader)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if string(body) != "abc" {
		t.Fatalf("raw body after file growth = %q, want %q", string(body), "abc")
	}
}

func TestOpenRawDoesNotInlineFakePNGWithHTMLContent(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "fake.png"), "<!doctype html><script>alert(1)</script>")
	store := newTestStore(t, Policy{Root: root, MaxRawFileSize: 1024})

	got, err := store.OpenRaw("fake.png")
	if err != nil {
		t.Fatalf("OpenRaw() error = %v", err)
	}
	defer got.Reader.Close()

	if got.Disposition != "attachment" {
		t.Fatalf("Disposition = %q, want attachment", got.Disposition)
	}
	if base := baseMediaType(t, got.MIME); base == "image/png" {
		t.Fatalf("MIME = %q, want non-image MIME for HTML content", got.MIME)
	}
}

func TestOpenRawForcesActiveContentDispositionForHTML(t *testing.T) {
	root := t.TempDir()
	content := "<!doctype html><title>x</title>"
	writeFile(t, filepath.Join(root, "index.html"), content)
	store := newTestStore(t, Policy{Root: root, MaxRawFileSize: 1024})

	got, err := store.OpenRaw("index.html")
	if err != nil {
		t.Fatalf("OpenRaw() error = %v", err)
	}
	defer got.Reader.Close()

	if got.Name != "index.html" {
		t.Fatalf("Name = %q, want index.html", got.Name)
	}
	if got.Disposition != "attachment" {
		t.Fatalf("Disposition = %q, want attachment", got.Disposition)
	}
	if base := baseMediaType(t, got.MIME); base != "text/html" {
		t.Fatalf("MIME = %q, want text/html", got.MIME)
	}
	if got.Size != int64(len(content)) {
		t.Fatalf("Size = %d, want %d", got.Size, len(content))
	}
	body, err := io.ReadAll(got.Reader)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if string(body) != content {
		t.Fatalf("raw body = %q, want %q", string(body), content)
	}
}

func newTestStore(t *testing.T, policy Policy) *Store {
	t.Helper()

	store, err := NewStore(policy)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	return store
}

func mustMkdir(t *testing.T, path string) {
	t.Helper()

	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
}

func appendFile(t *testing.T, path string, contents string) {
	t.Helper()

	file, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		t.Fatalf("OpenFile() error = %v", err)
	}
	defer file.Close()

	if _, err := file.WriteString(contents); err != nil {
		t.Fatalf("WriteString() error = %v", err)
	}
}

func writeBytes(t *testing.T, path string, contents []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, contents, 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func entryNames(entries []Entry) []string {
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name)
	}
	return names
}

func containsEntry(entries []Entry, name string) bool {
	for _, entry := range entries {
		if entry.Name == name {
			return true
		}
	}
	return false
}

func containsJSONField(body []byte, field string) bool {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return false
	}
	_, ok := fields[field]
	return ok
}

func testPNGBytes() []byte {
	return []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
		0x89,
	}
}
