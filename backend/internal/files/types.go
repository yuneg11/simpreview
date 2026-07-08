package files

import (
	"errors"
	"net/http"
)

type ErrorCode string

const (
	CodeBadRequest  ErrorCode = "bad_request"
	CodeForbidden   ErrorCode = "forbidden"
	CodeNotFound    ErrorCode = "not_found"
	CodeTooLarge    ErrorCode = "too_large"
	CodeUnsupported ErrorCode = "unsupported"
	CodeInternal    ErrorCode = "internal"
)

type AppError struct {
	Code    ErrorCode
	Message string
}

func (e AppError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Code != "" {
		return string(e.Code)
	}
	return string(CodeInternal)
}

func Status(err error) int {
	appErr, ok := appError(err)
	if !ok {
		return http.StatusInternalServerError
	}

	switch appErr.Code {
	case CodeBadRequest:
		return http.StatusBadRequest
	case CodeForbidden:
		return http.StatusForbidden
	case CodeNotFound:
		return http.StatusNotFound
	case CodeTooLarge:
		return http.StatusRequestEntityTooLarge
	case CodeUnsupported:
		return http.StatusUnsupportedMediaType
	case CodeInternal:
		return http.StatusInternalServerError
	default:
		return http.StatusInternalServerError
	}
}

func IsForbidden(err error) bool {
	appErr, ok := appError(err)
	return ok && appErr.Code == CodeForbidden
}

func appError(err error) (AppError, bool) {
	if err == nil {
		return AppError{}, false
	}

	var value AppError
	if errors.As(err, &value) {
		return value, true
	}

	var pointer *AppError
	if errors.As(err, &pointer) && pointer != nil {
		return *pointer, true
	}

	return AppError{}, false
}

type Policy struct {
	Root                string
	ShowHidden          bool
	AllowedSymlinkRoots []string
	MaxPreviewSize      int64
	MaxRawFileSize      int64
	MaxDirEntries       int
}

type ResolvedPath struct {
	RelPath string
	AbsPath string
}
