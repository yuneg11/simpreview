package files

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type Resolver struct {
	policy             Policy
	root               string
	allowedLinkTargets []string
}

const maxSymlinkDepth = 40

func CleanDocumentPath(raw string) (string, error) {
	if hasASCIIControl(raw) {
		return "", AppError{Code: CodeBadRequest, Message: "path contains control characters"}
	}
	if strings.Contains(raw, `\`) {
		return "", AppError{Code: CodeBadRequest, Message: "path contains backslash"}
	}

	path := strings.TrimPrefix(raw, "/")
	if err := rejectBadEscapes(path); err != nil {
		return "", err
	}

	decoded, err := url.PathUnescape(path)
	if err != nil {
		return "", AppError{Code: CodeBadRequest, Message: "path contains malformed percent escape"}
	}
	if hasASCIIControl(decoded) {
		return "", AppError{Code: CodeBadRequest, Message: "path contains control characters"}
	}
	if strings.Contains(decoded, `\`) {
		return "", AppError{Code: CodeBadRequest, Message: "path contains backslash"}
	}

	if decoded == "" {
		return "", nil
	}
	for _, segment := range strings.Split(decoded, "/") {
		if segment == "." || segment == ".." {
			return "", AppError{Code: CodeBadRequest, Message: "path contains relative segment"}
		}
		if segment == "" {
			return "", AppError{Code: CodeBadRequest, Message: "path contains empty segment"}
		}
	}

	return decoded, nil
}

func NewResolver(policy Policy) (*Resolver, error) {
	root, err := canonicalRoot(policy.Root)
	if err != nil {
		return nil, err
	}

	allowed := make([]string, 0, len(policy.AllowedSymlinkRoots))
	for _, raw := range policy.AllowedSymlinkRoots {
		root, err := canonicalRoot(raw)
		if err != nil {
			return nil, err
		}
		allowed = append(allowed, root)
	}

	policy.Root = root
	policy.AllowedSymlinkRoots = allowed
	return &Resolver{
		policy:             policy,
		root:               root,
		allowedLinkTargets: allowed,
	}, nil
}

func (r *Resolver) Resolve(raw string) (ResolvedPath, error) {
	relPath, err := CleanDocumentPath(raw)
	if err != nil {
		return ResolvedPath{}, err
	}
	if !r.policy.ShowHidden && hasHiddenComponent(relPath) {
		return ResolvedPath{}, AppError{Code: CodeForbidden, Message: "hidden path is not allowed"}
	}

	absPath := r.root
	if relPath != "" {
		absPath = filepath.Join(r.root, filepath.FromSlash(relPath))
	}
	absPath = filepath.Clean(absPath)
	if !pathWithin(r.root, absPath) {
		return ResolvedPath{}, AppError{Code: CodeForbidden, Message: "path escapes root"}
	}

	// v1 trust model: each request and symlink component is validated at resolution
	// time, but this is not openat-style protection against concurrent root changes.
	resolvedPath, err := r.resolveExistingComponents(relPath)
	if err != nil {
		return ResolvedPath{}, err
	}

	return ResolvedPath{RelPath: relPath, AbsPath: resolvedPath}, nil
}

func (r *Resolver) resolveExistingComponents(relPath string) (string, error) {
	if relPath == "" {
		return r.root, nil
	}

	return r.resolveFromBase(r.root, strings.Split(relPath, "/"), 0)
}

func (r *Resolver) resolveFromBase(base string, components []string, depth int) (string, error) {
	if depth > maxSymlinkDepth {
		return "", AppError{Code: CodeInternal, Message: "too many symbolic links"}
	}

	current := base
	for i, component := range components {
		candidate := filepath.Clean(filepath.Join(current, filepath.FromSlash(component)))
		info, err := os.Lstat(candidate)
		if err != nil {
			if os.IsNotExist(err) {
				return r.resolveMissingPath(candidate, components[i+1:])
			}
			return "", AppError{Code: CodeInternal, Message: "failed to stat path"}
		}

		if info.Mode()&os.ModeSymlink != 0 {
			target, err := readSymlinkTarget(candidate)
			if err != nil {
				return "", err
			}
			return r.resolveKnownPath(joinPathComponents(target, components[i+1:]), depth+1)
		}

		if err := r.checkResolvedPath(candidate); err != nil {
			return "", err
		}
		current = candidate
	}

	return current, nil
}

func (r *Resolver) resolveKnownPath(path string, depth int) (string, error) {
	if depth > maxSymlinkDepth {
		return "", AppError{Code: CodeInternal, Message: "too many symbolic links"}
	}

	path = filepath.Clean(path)
	base, ok := r.allowedBaseFor(path)
	if !ok {
		resolved, err := filepath.EvalSymlinks(path)
		if err != nil {
			return "", AppError{Code: CodeForbidden, Message: "symlink target escapes root"}
		}
		resolved = filepath.Clean(resolved)
		if err := r.checkResolvedPath(resolved); err != nil {
			return "", err
		}
		return resolved, nil
	}

	rel := relativeToBase(base, path)
	if rel == "" {
		if err := r.checkResolvedPath(path); err != nil {
			return "", err
		}
		return path, nil
	}

	return r.resolveFromBase(base, strings.Split(rel, "/"), depth)
}

func (r *Resolver) resolveMissingPath(base string, remaining []string) (string, error) {
	missingPath := joinPathComponents(base, remaining)
	if err := r.checkResolvedPath(missingPath); err != nil {
		return "", err
	}
	return missingPath, nil
}

func readSymlinkTarget(path string) (string, error) {
	target, err := os.Readlink(path)
	if err != nil {
		return "", AppError{Code: CodeInternal, Message: "failed to read symlink target"}
	}
	if filepath.IsAbs(target) {
		return filepath.Clean(target), nil
	}
	return filepath.Clean(filepath.Join(filepath.Dir(path), target)), nil
}

func joinPathComponents(base string, components []string) string {
	path := base
	for _, component := range components {
		path = filepath.Join(path, filepath.FromSlash(component))
	}
	return filepath.Clean(path)
}

func (r *Resolver) checkResolvedPath(path string) error {
	base, ok := r.allowedBaseFor(path)
	if !ok {
		return AppError{Code: CodeForbidden, Message: "symlink target escapes root"}
	}
	if !r.policy.ShowHidden {
		if base != r.root && hasHiddenComponent(filepath.ToSlash(base)) {
			return AppError{Code: CodeForbidden, Message: "hidden symlink target is not allowed"}
		}
		if hasHiddenComponent(relativeToBase(base, path)) {
			return AppError{Code: CodeForbidden, Message: "hidden symlink target is not allowed"}
		}
	}
	return nil
}

func canonicalRoot(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", AppError{Code: CodeBadRequest, Message: "root is required"}
	}

	abs, err := filepath.Abs(raw)
	if err != nil {
		return "", AppError{Code: CodeBadRequest, Message: "root must be absolute"}
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", AppError{Code: CodeBadRequest, Message: fmt.Sprintf("failed to resolve root %q", raw)}
	}
	return filepath.Clean(resolved), nil
}

func rejectBadEscapes(s string) error {
	for i := 0; i < len(s); i++ {
		if s[i] != '%' {
			continue
		}
		if i+2 >= len(s) || !isHex(s[i+1]) || !isHex(s[i+2]) {
			return AppError{Code: CodeBadRequest, Message: "path contains malformed percent escape"}
		}
		hex := strings.ToLower(s[i+1 : i+3])
		if hex == "2f" || hex == "5c" {
			return AppError{Code: CodeBadRequest, Message: "path contains encoded separator"}
		}
		i += 2
	}
	return nil
}

func isHex(b byte) bool {
	return ('0' <= b && b <= '9') || ('a' <= b && b <= 'f') || ('A' <= b && b <= 'F')
}

func hasASCIIControl(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < 0x20 || s[i] == 0x7f {
			return true
		}
	}
	return false
}

func hasHiddenComponent(path string) bool {
	if path == "" {
		return false
	}
	for _, segment := range strings.Split(path, "/") {
		if strings.HasPrefix(segment, ".") {
			return true
		}
	}
	return false
}

func (r *Resolver) allowedBaseFor(path string) (string, bool) {
	if pathWithin(r.root, path) {
		return r.root, true
	}
	for _, allowed := range r.allowedLinkTargets {
		if pathWithin(allowed, path) {
			return allowed, true
		}
	}
	return "", false
}

func pathWithin(base string, path string) bool {
	rel, err := filepath.Rel(base, path)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel))
}

func relativeToBase(base string, path string) string {
	rel, err := filepath.Rel(base, path)
	if err != nil || rel == "." {
		return ""
	}
	return filepath.ToSlash(rel)
}
