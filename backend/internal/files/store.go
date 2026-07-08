package files

import (
	"errors"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const detectSampleSize = 512

type Store struct {
	policy   Policy
	resolver *Resolver
}

type Directory struct {
	Kind          string  `json:"kind"`
	Path          string  `json:"path"`
	CanonicalPath string  `json:"canonicalPath"`
	Entries       []Entry `json:"entries"`
	Truncated     bool    `json:"truncated"`
}

type Entry struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Kind     string    `json:"kind"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	Symlink  bool      `json:"symlink"`
}

type File struct {
	Kind          string     `json:"kind"`
	Path          string     `json:"path"`
	CanonicalPath string     `json:"canonicalPath"`
	MIME          string     `json:"mime"`
	RenderMode    RenderMode `json:"renderMode"`
	Size          int64      `json:"size"`
	Content       string     `json:"content,omitempty"`
	RawURL        string     `json:"rawURL,omitempty"`
	TooLarge      bool       `json:"tooLarge,omitempty"`
}

type RawFile struct {
	Name        string
	MIME        string
	Disposition string
	Size        int64
	Reader      io.ReadCloser
}

func NewStore(policy Policy) (*Store, error) {
	resolver, err := NewResolver(policy)
	if err != nil {
		return nil, err
	}
	return &Store{policy: resolver.policy, resolver: resolver}, nil
}

func (s *Store) List(rawPath string) (Directory, error) {
	resolved, err := s.resolver.Resolve(rawPath)
	if err != nil {
		return Directory{}, err
	}

	dir, err := os.Open(resolved.AbsPath)
	if err != nil {
		return Directory{}, mapPathError(err, "failed to open directory")
	}
	defer dir.Close()

	info, err := dir.Stat()
	if err != nil {
		return Directory{}, mapPathError(err, "failed to stat directory")
	}
	if !info.IsDir() {
		return Directory{}, AppError{Code: CodeUnsupported, Message: "path is not a directory"}
	}

	readCount := -1
	if s.policy.MaxDirEntries > 0 {
		readCount = s.policy.MaxDirEntries + 1
	}
	children, err := dir.ReadDir(readCount)
	if err != nil && !errors.Is(err, io.EOF) {
		return Directory{}, mapPathError(err, "failed to read directory")
	}

	entries := make([]Entry, 0, len(children))
	for _, child := range children {
		name := child.Name()
		if !s.policy.ShowHidden && strings.HasPrefix(name, ".") {
			continue
		}

		entry, ok, err := s.entryForChild(resolved, child)
		if err != nil {
			return Directory{}, err
		}
		if ok {
			entries = append(entries, entry)
		}
	}

	truncated := false
	if s.policy.MaxDirEntries > 0 && len(children) > s.policy.MaxDirEntries {
		truncated = true
	}

	sort.SliceStable(entries, func(i, j int) bool {
		iDir := entries[i].Kind == "directory"
		jDir := entries[j].Kind == "directory"
		if iDir != jDir {
			return iDir
		}
		return entries[i].Name < entries[j].Name
	})

	if s.policy.MaxDirEntries > 0 && len(entries) > s.policy.MaxDirEntries {
		truncated = true
		entries = entries[:s.policy.MaxDirEntries]
	}

	return Directory{
		Kind:          "directory",
		Path:          resolved.RelPath,
		CanonicalPath: resolved.AbsPath,
		Entries:       entries,
		Truncated:     truncated,
	}, nil
}

func (s *Store) ReadPreview(rawPath string) (File, error) {
	resolved, file, info, err := s.openRegularFile(rawPath)
	if err != nil {
		return File{}, err
	}
	defer file.Close()

	name := displayName(resolved)
	result := File{
		Kind:          "file",
		Path:          resolved.RelPath,
		CanonicalPath: resolved.AbsPath,
		Size:          info.Size(),
	}
	if !tooLarge(info.Size(), s.policy.MaxRawFileSize) {
		result.RawURL = rawURLForPath(resolved.RelPath)
	}

	// Files too large to inline are handled from a sample: images still preview
	// via their raw URL, while other content becomes a download-only node
	// instead of an error.
	if tooLarge(info.Size(), s.policy.MaxPreviewSize) {
		sample, err := readRawSample(file, info.Size())
		if err != nil {
			return File{}, AppError{Code: CodeInternal, Message: "failed to read file sample"}
		}
		result.RenderMode, result.MIME = DetectRenderMode(name, sample)
		if result.RenderMode == RenderModeImage {
			return result, nil
		}
		result.TooLarge = true
		return result, nil
	}

	content, err := readPreviewBytes(file, s.policy.MaxPreviewSize)
	if err != nil {
		return File{}, err
	}
	sample := sampleBytes(content)
	result.RenderMode, result.MIME = DetectRenderMode(name, sample)

	// Inline content only for textual files. Binary content and raster images
	// carry no content; the client uses rawURL to download or preview them.
	if !looksBinary(sample) {
		result.Content = string(content)
	}
	return result, nil
}

func (s *Store) OpenRaw(rawPath string) (RawFile, error) {
	resolved, file, info, err := s.openRegularFile(rawPath)
	if err != nil {
		return RawFile{}, err
	}
	if tooLarge(info.Size(), s.policy.MaxRawFileSize) {
		file.Close()
		return RawFile{}, AppError{Code: CodeTooLarge, Message: "file exceeds raw size limit"}
	}

	acceptedSize := info.Size()
	sample, err := readRawSample(file, acceptedSize)
	if err != nil {
		file.Close()
		return RawFile{}, AppError{Code: CodeInternal, Message: "failed to read file sample"}
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		file.Close()
		return RawFile{}, AppError{Code: CodeInternal, Message: "failed to rewind file"}
	}

	name := displayName(resolved)
	mimeType := DetectRawMIME(name, sample)
	return RawFile{
		Name:        name,
		MIME:        mimeType,
		Disposition: RawDisposition(name, mimeType),
		Size:        acceptedSize,
		Reader:      limitReadCloser(file, acceptedSize),
	}, nil
}

func (s *Store) entryForChild(parent ResolvedPath, child os.DirEntry) (Entry, bool, error) {
	relPath := joinDocumentPath(parent.RelPath, child.Name())
	childResolved, err := s.resolveListedPath(relPath)
	if err != nil {
		if IsForbidden(err) {
			return Entry{}, false, nil
		}
		return Entry{}, false, err
	}

	info, err := child.Info()
	if err != nil {
		return Entry{}, false, mapPathError(err, "failed to stat directory entry")
	}

	displayInfo := info
	symlink := info.Mode()&os.ModeSymlink != 0
	if symlink {
		targetInfo, err := os.Stat(childResolved.AbsPath)
		if err == nil {
			displayInfo = targetInfo
		} else if !errors.Is(err, os.ErrNotExist) {
			return Entry{}, false, mapPathError(err, "failed to stat symbolic link target")
		}
	}

	return Entry{
		Name:     child.Name(),
		Path:     relPath,
		Kind:     kindForInfo(displayInfo),
		Size:     displayInfo.Size(),
		Modified: displayInfo.ModTime(),
		Symlink:  symlink,
	}, true, nil
}

func (s *Store) resolveListedPath(relPath string) (ResolvedPath, error) {
	if hasASCIIControl(relPath) || strings.Contains(relPath, `\`) {
		return ResolvedPath{}, AppError{Code: CodeForbidden, Message: "directory entry path is not addressable"}
	}
	if !s.policy.ShowHidden && hasHiddenComponent(relPath) {
		return ResolvedPath{}, AppError{Code: CodeForbidden, Message: "hidden path is not allowed"}
	}

	absPath, err := s.resolver.resolveExistingComponents(relPath)
	if err != nil {
		return ResolvedPath{}, err
	}
	return ResolvedPath{RelPath: relPath, AbsPath: absPath}, nil
}

func (s *Store) openRegularFile(rawPath string) (ResolvedPath, *os.File, os.FileInfo, error) {
	resolved, err := s.resolver.Resolve(rawPath)
	if err != nil {
		return ResolvedPath{}, nil, nil, err
	}

	file, err := os.Open(resolved.AbsPath)
	if err != nil {
		return ResolvedPath{}, nil, nil, mapPathError(err, "failed to open file")
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return ResolvedPath{}, nil, nil, mapPathError(err, "failed to stat file")
	}
	if !info.Mode().IsRegular() {
		file.Close()
		return ResolvedPath{}, nil, nil, AppError{Code: CodeUnsupported, Message: "path is not a regular file"}
	}
	return resolved, file, info, nil
}

func readPreviewBytes(reader io.Reader, limit int64) ([]byte, error) {
	if limit <= 0 {
		content, err := io.ReadAll(reader)
		if err != nil {
			return nil, AppError{Code: CodeInternal, Message: "failed to read file"}
		}
		return content, nil
	}

	content, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, AppError{Code: CodeInternal, Message: "failed to read file"}
	}
	if int64(len(content)) > limit {
		return nil, AppError{Code: CodeTooLarge, Message: "file exceeds preview size limit"}
	}
	return content, nil
}

func readRawSample(reader io.Reader, acceptedSize int64) ([]byte, error) {
	limit := int64(detectSampleSize)
	if acceptedSize < limit {
		limit = acceptedSize
	}
	return io.ReadAll(io.LimitReader(reader, limit))
}

func sampleBytes(content []byte) []byte {
	if len(content) > detectSampleSize {
		return content[:detectSampleSize]
	}
	return content
}

type limitedReadCloser struct {
	reader io.Reader
	closer io.Closer
}

func (r limitedReadCloser) Read(p []byte) (int, error) {
	return r.reader.Read(p)
}

func (r limitedReadCloser) Close() error {
	return r.closer.Close()
}

func limitReadCloser(reader io.ReadCloser, limit int64) io.ReadCloser {
	return limitedReadCloser{
		reader: io.LimitReader(reader, limit),
		closer: reader,
	}
}

func mapPathError(err error, message string) error {
	if errors.Is(err, os.ErrNotExist) {
		return AppError{Code: CodeNotFound, Message: "path not found"}
	}
	if errors.Is(err, os.ErrPermission) {
		return AppError{Code: CodeForbidden, Message: "path is not allowed"}
	}
	return AppError{Code: CodeInternal, Message: message}
}

func tooLarge(size int64, limit int64) bool {
	return limit > 0 && size > limit
}

func kindForInfo(info os.FileInfo) string {
	switch {
	case info.IsDir():
		return "directory"
	case info.Mode().IsRegular():
		return "file"
	case info.Mode()&os.ModeSymlink != 0:
		return "symlink"
	default:
		return "other"
	}
}

func joinDocumentPath(base string, name string) string {
	if base == "" {
		return name
	}
	return path.Join(base, name)
}

func displayName(resolved ResolvedPath) string {
	if resolved.RelPath != "" {
		return path.Base(resolved.RelPath)
	}
	return filepath.Base(resolved.AbsPath)
}

func rawURLForPath(relPath string) string {
	if relPath == "" {
		return "/-/raw/"
	}

	segments := strings.Split(relPath, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	return "/-/raw/" + strings.Join(segments, "/")
}
