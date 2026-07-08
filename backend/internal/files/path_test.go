package files

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestStatusMapsAppErrorCodes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{name: "bad request", err: AppError{Code: ErrorCode("bad_request"), Message: "bad"}, want: http.StatusBadRequest},
		{name: "forbidden", err: AppError{Code: ErrorCode("forbidden"), Message: "forbidden"}, want: http.StatusForbidden},
		{name: "not found", err: AppError{Code: ErrorCode("not_found"), Message: "missing"}, want: http.StatusNotFound},
		{name: "too large", err: AppError{Code: ErrorCode("too_large"), Message: "large"}, want: http.StatusRequestEntityTooLarge},
		{name: "unsupported", err: AppError{Code: ErrorCode("unsupported"), Message: "unsupported"}, want: http.StatusUnsupportedMediaType},
		{name: "internal", err: AppError{Code: ErrorCode("internal"), Message: "internal"}, want: http.StatusInternalServerError},
		{name: "unknown app code", err: AppError{Code: ErrorCode("other"), Message: "other"}, want: http.StatusInternalServerError},
		{name: "plain error", err: errors.New("plain"), want: http.StatusInternalServerError},
		{name: "nil", err: nil, want: http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Status(tt.err); got != tt.want {
				t.Fatalf("Status(%v) = %d, want %d", tt.err, got, tt.want)
			}
		})
	}
}

func TestIsForbidden(t *testing.T) {
	if !IsForbidden(AppError{Code: ErrorCode("forbidden"), Message: "blocked"}) {
		t.Fatal("IsForbidden(forbidden AppError) = false, want true")
	}
	if IsForbidden(AppError{Code: ErrorCode("bad_request"), Message: "bad"}) {
		t.Fatal("IsForbidden(bad_request AppError) = true, want false")
	}
	if IsForbidden(errors.New("plain")) {
		t.Fatal("IsForbidden(plain error) = true, want false")
	}
}

func TestCleanDocumentPathAccepts(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{raw: "", want: ""},
		{raw: "/", want: ""},
		{raw: "notes/readme", want: "notes/readme"},
		{raw: "/notes/a.md", want: "notes/a.md"},
		{raw: "space%20x.md", want: "space x.md"},
	}

	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got, err := CleanDocumentPath(tt.raw)
			if err != nil {
				t.Fatalf("CleanDocumentPath(%q) error = %v", tt.raw, err)
			}
			if got != tt.want {
				t.Fatalf("CleanDocumentPath(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

func TestCleanDocumentPathRejects(t *testing.T) {
	tests := []string{
		"../secret",
		"a/../secret",
		".",
		"a/.",
		"%2e%2e/secret",
		"a%2fb",
		`a\b`,
		"a%5Cb",
		"a%00b",
		"a%1fb",
		"%zz",
	}

	for _, raw := range tests {
		t.Run(raw, func(t *testing.T) {
			if got, err := CleanDocumentPath(raw); err == nil {
				t.Fatalf("CleanDocumentPath(%q) = %q, want error", raw, got)
			}
		})
	}
}

func TestResolveKeepsNormalPathsInsideRoot(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "notes", "readme.md"), "hello")

	resolver := newTestResolver(t, Policy{Root: root})

	got, err := resolver.Resolve("/notes/readme.md")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got.RelPath != "notes/readme.md" {
		t.Fatalf("RelPath = %q, want %q", got.RelPath, "notes/readme.md")
	}
	wantAbs := filepath.Join(root, "notes", "readme.md")
	if got.AbsPath != wantAbs {
		t.Fatalf("AbsPath = %q, want %q", got.AbsPath, wantAbs)
	}
}

func TestResolveRejectsHiddenLexicalPathByDefault(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".secret", "note.md"), "secret")

	resolver := newTestResolver(t, Policy{Root: root})

	_, err := resolver.Resolve(".secret/note.md")
	if !IsForbidden(err) {
		t.Fatalf("Resolve() error = %v, want forbidden", err)
	}
}

func TestResolveAllowsHiddenPathsWithShowHidden(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".secret", "note.md"), "secret")

	resolver := newTestResolver(t, Policy{Root: root, ShowHidden: true})

	got, err := resolver.Resolve(".secret/note.md")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got.RelPath != ".secret/note.md" {
		t.Fatalf("RelPath = %q, want %q", got.RelPath, ".secret/note.md")
	}
	if got.AbsPath != filepath.Join(root, ".secret", "note.md") {
		t.Fatalf("AbsPath = %q, want hidden file path", got.AbsPath)
	}
}

func TestResolveRejectsSymlinkToOutsideRootByDefault(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	outside := t.TempDir()
	writeFile(t, filepath.Join(outside, "outside.md"), "outside")
	mustSymlink(t, filepath.Join(outside, "outside.md"), filepath.Join(root, "link.md"))

	resolver := newTestResolver(t, Policy{Root: root})

	_, err := resolver.Resolve("link.md")
	if !IsForbidden(err) {
		t.Fatalf("Resolve() error = %v, want forbidden", err)
	}
}

func TestResolveRejectsDanglingSymlinkToOutsideRootByDefault(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	outside := t.TempDir()
	mustSymlink(t, filepath.Join(outside, "new.md"), filepath.Join(root, "link"))

	resolver := newTestResolver(t, Policy{Root: root})

	_, err := resolver.Resolve("link")
	if !IsForbidden(err) {
		t.Fatalf("Resolve() error = %v, want forbidden", err)
	}
}

func TestResolveRejectsDanglingSymlinkToHiddenAllowedTargetWhenShowHiddenFalse(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	outside := t.TempDir()
	mustSymlink(t, filepath.Join(outside, ".secret", "new.md"), filepath.Join(root, "link"))

	resolver := newTestResolver(t, Policy{Root: root, AllowedSymlinkRoots: []string{outside}})

	_, err := resolver.Resolve("link")
	if !IsForbidden(err) {
		t.Fatalf("Resolve() error = %v, want forbidden", err)
	}
}

func TestResolveRejectsSymlinkedParentToOutsideRootWithMissingLeaf(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	outside := t.TempDir()
	outsideDir := filepath.Join(outside, "dir")
	if err := os.MkdirAll(outsideDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	mustSymlink(t, outsideDir, filepath.Join(root, "link"))

	resolver := newTestResolver(t, Policy{Root: root})

	_, err := resolver.Resolve("link/missing.md")
	if !IsForbidden(err) {
		t.Fatalf("Resolve() error = %v, want forbidden", err)
	}
}

func TestResolveAllowsDanglingSymlinkInsideExplicitAllowedSymlinkRoot(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	allowed := t.TempDir()
	allowedTarget := filepath.Join(allowed, "new.md")
	mustSymlink(t, allowedTarget, filepath.Join(root, "link"))

	resolver := newTestResolver(t, Policy{Root: root, AllowedSymlinkRoots: []string{allowed}})

	got, err := resolver.Resolve("link")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got.RelPath != "link" {
		t.Fatalf("RelPath = %q, want %q", got.RelPath, "link")
	}
	if got.AbsPath != allowedTarget {
		t.Fatalf("AbsPath = %q, want %q", got.AbsPath, allowedTarget)
	}
}

func TestResolveRejectsDanglingSymlinkInsideHiddenAllowedSymlinkRootWhenShowHiddenFalse(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	parent := t.TempDir()
	allowed := filepath.Join(parent, ".secret")
	if err := os.MkdirAll(allowed, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	allowedTarget := filepath.Join(allowed, "new.md")
	mustSymlink(t, allowedTarget, filepath.Join(root, "link"))

	resolver := newTestResolver(t, Policy{Root: root, AllowedSymlinkRoots: []string{allowed}})

	_, err := resolver.Resolve("link")
	if !IsForbidden(err) {
		t.Fatalf("Resolve() error = %v, want forbidden", err)
	}
}

func TestResolveAllowsDanglingSymlinkInsideHiddenAllowedSymlinkRootWhenShowHiddenTrue(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	parent := t.TempDir()
	allowed := filepath.Join(parent, ".secret")
	if err := os.MkdirAll(allowed, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	allowedTarget := filepath.Join(allowed, "new.md")
	mustSymlink(t, allowedTarget, filepath.Join(root, "link"))

	resolver := newTestResolver(t, Policy{
		Root:                root,
		ShowHidden:          true,
		AllowedSymlinkRoots: []string{allowed},
	})

	got, err := resolver.Resolve("link")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got.RelPath != "link" {
		t.Fatalf("RelPath = %q, want %q", got.RelPath, "link")
	}
	if got.AbsPath != allowedTarget {
		t.Fatalf("AbsPath = %q, want %q", got.AbsPath, allowedTarget)
	}
}

func TestResolveAllowsSymlinkTargetInsideExplicitAllowedSymlinkRoot(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	allowed := t.TempDir()
	writeFile(t, filepath.Join(allowed, "allowed.md"), "allowed")
	mustSymlink(t, filepath.Join(allowed, "allowed.md"), filepath.Join(root, "link.md"))

	resolver := newTestResolver(t, Policy{Root: root, AllowedSymlinkRoots: []string{allowed}})

	got, err := resolver.Resolve("link.md")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	wantAbs, err := filepath.EvalSymlinks(filepath.Join(allowed, "allowed.md"))
	if err != nil {
		t.Fatalf("EvalSymlinks() error = %v", err)
	}
	if got.RelPath != "link.md" {
		t.Fatalf("RelPath = %q, want %q", got.RelPath, "link.md")
	}
	if got.AbsPath != wantAbs {
		t.Fatalf("AbsPath = %q, want %q", got.AbsPath, wantAbs)
	}
}

func TestResolveAllowsSymlinkedParentInsideExplicitAllowedSymlinkRootWithMissingLeaf(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	allowed := t.TempDir()
	allowedDir := filepath.Join(allowed, "dir")
	if err := os.MkdirAll(allowedDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	mustSymlink(t, allowedDir, filepath.Join(root, "link"))

	resolver := newTestResolver(t, Policy{Root: root, AllowedSymlinkRoots: []string{allowed}})

	got, err := resolver.Resolve("link/missing.md")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got.RelPath != "link/missing.md" {
		t.Fatalf("RelPath = %q, want %q", got.RelPath, "link/missing.md")
	}
	wantAbs := filepath.Join(allowedDir, "missing.md")
	if got.AbsPath != wantAbs {
		t.Fatalf("AbsPath = %q, want %q", got.AbsPath, wantAbs)
	}
}

func TestResolveRejectsSymlinkAliasToHiddenTargetWhenShowHiddenFalse(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink behavior is platform-specific on Windows")
	}

	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".secret", "note.md"), "secret")
	mustSymlink(t, filepath.Join(root, ".secret", "note.md"), filepath.Join(root, "public.md"))

	resolver := newTestResolver(t, Policy{Root: root})

	_, err := resolver.Resolve("public.md")
	if !IsForbidden(err) {
		t.Fatalf("Resolve() error = %v, want forbidden", err)
	}
}

func newTestResolver(t *testing.T, policy Policy) *Resolver {
	t.Helper()

	resolver, err := NewResolver(policy)
	if err != nil {
		t.Fatalf("NewResolver() error = %v", err)
	}
	return resolver
}

func writeFile(t *testing.T, path string, contents string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func mustSymlink(t *testing.T, oldname string, newname string) {
	t.Helper()

	if err := os.Symlink(oldname, newname); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
}
