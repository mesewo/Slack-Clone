package upload

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func TestAllowedType(t *testing.T) {
	for _, contentType := range []string{"image/png", "video/mp4", "application/pdf", "application/octet-stream", "text/plain"} {
		if !allowedType(contentType) {
			t.Errorf("expected %s to be allowed", contentType)
		}
	}
	if allowedType("application/x-executable") {
		t.Fatal("unexpected executable type allowed")
	}
}

func TestParseRangeClassifiesInvalidRanges(t *testing.T) {
	cases := []struct {
		name     string
		value    string
		size     int64
		wantOK   bool
		wantRange bool
	}{
		{name: "no range", value: "", size: 1000, wantOK: true, wantRange: false},
		{name: "basic range", value: "bytes=0-99", size: 1000, wantOK: true, wantRange: true},
		{name: "suffix range", value: "bytes=-100", size: 1000, wantOK: true, wantRange: true},
		{name: "open ended", value: "bytes=100-", size: 1000, wantOK: true, wantRange: true},
		{name: "invalid reversed", value: "bytes=100-50", size: 1000, wantOK: false, wantRange: true},
		{name: "invalid out of bounds", value: "bytes=999999-", size: 1000, wantOK: false, wantRange: true},
		{name: "malformed", value: "bytes=abc", size: 1000, wantOK: false, wantRange: true},
	}

	for _, tc := range cases {
		start, end, hasRange, valid := parseRange(tc.value, tc.size)
		if hasRange != tc.wantRange {
			t.Fatalf("%s: hasRange=%v want %v", tc.name, hasRange, tc.wantRange)
		}
		if valid != tc.wantOK {
			t.Fatalf("%s: valid=%v want %v", tc.name, valid, tc.wantOK)
		}
		if !tc.wantRange && start != 0 && end != tc.size-1 {
			t.Fatalf("%s: unexpected full-range bounds: start=%d end=%d size=%d", tc.name, start, end, tc.size)
		}
		_ = start
		_ = end
	}
}

func TestSafeObjectKeyDoesNotExposeRawPath(t *testing.T) {
	key := safeUploadKey("user-123", "../../secret.txt")
	if key == "../../secret.txt" || key == "" {
		t.Fatalf("raw path leaked into object key: %q", key)
	}
	if filepath.Base(key) == "../../secret.txt" {
		t.Fatal("object key still exposes raw filename path")
	}
	if len(key) == 0 {
		t.Fatal("generated key is empty")
	}
}

func TestValidatePresignRequest(t *testing.T) {
	if _, _, _, err := validatePresignRequest("report.pdf", "application/pdf", 1024); err != nil {
		t.Fatalf("valid presign request should pass: %v", err)
	}
	if _, _, _, err := validatePresignRequest("", "application/pdf", 1024); err == nil {
		t.Fatal("empty filename should be rejected")
	}
	if _, _, _, err := validatePresignRequest("malware.exe", "application/x-msdownload", 1024); err == nil {
		t.Fatal("unsupported content type should be rejected")
	}
	if _, _, _, err := validatePresignRequest("too-large.bin", "application/octet-stream", maxUploadSize+1); err == nil {
		t.Fatal("oversized uploads should be rejected")
	}
}

func TestParseRangeHTTPSemantics(t *testing.T) {
	start, end, partial, valid := parseRange("bytes=0-9", 10)
	if !partial || !valid || start != 0 || end != 9 {
		t.Fatalf("expected valid 10-byte range, got start=%d end=%d partial=%v valid=%v", start, end, partial, valid)
	}
	if _, _, partial, valid = parseRange("bytes=10-20", 10); partial && valid {
		t.Fatal("invalid range beyond file size should be rejected")
	}
	if _, _, partial, valid = parseRange("bytes=0-0,1-2", 10); partial && valid {
		t.Fatal("malformed multi-range should be rejected")
	}
	if _, _, partial, valid = parseRange("", 10); partial || !valid {
		t.Fatalf("no range should be treated as full content: partial=%v valid=%v", partial, valid)
	}
}

func TestThumbnailResultState(t *testing.T) {
	if next, retry := thumbnailResultState("UPLOADED", 0, true); next != "READY" || retry {
		t.Fatalf("successful upload should finalize as READY: next=%s retry=%v", next, retry)
	}
	if next, retry := thumbnailResultState("PROCESSING", 1, false); next != "PROCESSING" || !retry {
		t.Fatalf("retryable thumbnail failure should remain PROCESSING for retry: next=%s retry=%v", next, retry)
	}
	if next, retry := thumbnailResultState("PROCESSING", 3, false); next != "FAILED" || retry {
		t.Fatalf("final retry failure should mark FAILED: next=%s retry=%v", next, retry)
	}
}

type stubQueryRow struct {
	fun func(dest ...any) error
}

func (s stubQueryRow) Scan(dest ...any) error {
	return s.fun(dest...)
}

type stubDB struct {
	queryRow func(ctx context.Context, sql string, args ...any) pgx.Row
}

func (s *stubDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) { return pgconn.CommandTag{}, nil }
func (s *stubDB) Query(context.Context, string, ...any) (pgx.Rows, error)        { return nil, nil }
func (s *stubDB) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if s.queryRow == nil {
		return stubQueryRow{fun: func(dest ...any) error { return nil }}
	}
	return s.queryRow(ctx, sql, args...)
}

func TestAttachmentAccessAllowed(t *testing.T) {
	userID := uuid.New()
	channelID := uuid.New()
	db := &stubDB{queryRow: func(ctx context.Context, sql string, args ...any) pgx.Row {
		switch {
		case strings.Contains(sql, "FROM messages WHERE id = $1"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*database.Message)) = database.Message{ChannelID: channelID}
				return nil
			}}
		case strings.Contains(sql, "SELECT EXISTS"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*bool)) = true
				return nil
			}}
		default:
			return stubQueryRow{fun: func(dest ...any) error { return nil }}
		}
	}}
	h := &Handler{Queries: database.New(db)}
	attachment := database.Attachment{ID: uuid.New(), UserID: uuid.New(), MessageID: uuid.NullUUID{UUID: uuid.New(), Valid: true}}
	allowed, err := h.attachmentAccessAllowed(context.Background(), userID, attachment)
	if err != nil {
		t.Fatalf("unexpected auth lookup error: %v", err)
	}
	if !allowed {
		t.Fatal("expected channel member to be allowed access")
	}

	deniedDB := &stubDB{queryRow: func(ctx context.Context, sql string, args ...any) pgx.Row {
		return stubQueryRow{fun: func(dest ...any) error {
			if len(dest) > 0 {
				if b, ok := dest[0].(*bool); ok {
					*b = false
					return nil
				}
			}
			return nil
		}}
	}}
	h2 := &Handler{Queries: database.New(deniedDB)}
	attachment2 := database.Attachment{ID: uuid.New(), UserID: uuid.New(), MessageID: uuid.NullUUID{UUID: uuid.New(), Valid: true}}
	allowed, err = h2.attachmentAccessAllowed(context.Background(), userID, attachment2)
	if err != nil {
		t.Fatalf("unexpected deny path error: %v", err)
	}
	if allowed {
		t.Fatal("expected non-member to be denied access")
	}
}

func TestServeRejectsUnauthorizedAttachment(t *testing.T) {
	userID := uuid.New()
	attachmentID := uuid.New()
	attachment := database.Attachment{ID: attachmentID, UserID: uuid.New(), MessageID: uuid.NullUUID{UUID: uuid.New(), Valid: true}}
	db := &stubDB{queryRow: func(ctx context.Context, sql string, args ...any) pgx.Row {
		switch {
		case strings.Contains(sql, "FROM attachments WHERE id = $1"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*uuid.UUID)) = attachment.ID
				*(dest[1].(*uuid.NullUUID)) = attachment.MessageID
				*(dest[2].(*uuid.UUID)) = attachment.UserID
				*(dest[3].(*string)) = attachment.Filename
				*(dest[4].(*string)) = attachment.ContentType
				*(dest[5].(*int64)) = attachment.SizeBytes
				*(dest[6].(*string)) = attachment.StoragePath
				*(dest[7].(*pgtype.Text)) = attachment.ThumbnailPath
				*(dest[8].(*time.Time)) = attachment.CreatedAt
				*(dest[9].(*uuid.NullUUID)) = attachment.DirectMessageID
				return nil
			}}
		case strings.Contains(sql, "FROM messages WHERE id = $1"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*uuid.UUID)) = uuid.New()
				*(dest[1].(*uuid.UUID)) = uuid.New()
				*(dest[2].(*uuid.NullUUID)) = uuid.NullUUID{Valid: true, UUID: userID}
				*(dest[3].(*string)) = "body"
				*(dest[4].(*time.Time)) = time.Now()
				*(dest[5].(**time.Time)) = nil
				*(dest[6].(**time.Time)) = nil
				*(dest[7].(*uuid.NullUUID)) = uuid.NullUUID{}
				*(dest[8].(*int32)) = 0
				return nil
			}}
		case strings.Contains(sql, "SELECT EXISTS"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*bool)) = false
				return nil
			}}
		default:
			return stubQueryRow{fun: func(dest ...any) error { return nil }}
		}
	}}
	h := &Handler{Queries: database.New(db)}
	r := chi.NewRouter()
	r.Get("/uploads/{id}", h.Serve)
	req := httptest.NewRequest(http.MethodGet, "/uploads/"+attachmentID.String(), nil)
	ctx := context.WithValue(req.Context(), auth.UserContextKey, &auth.Claims{UserID: userID.String()})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 forbidden for unauthorized download, got %d body=%s", rec.Code, rec.Body.String())
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func TestServeAllowsAuthorizedAttachment(t *testing.T) {
	userID := uuid.New()
	attachmentID := uuid.New()
	payload := []byte("hello from authorized member")
	attachment := database.Attachment{
		ID:          attachmentID,
		UserID:      userID,
		MessageID:   uuid.NullUUID{UUID: uuid.New(), Valid: true},
		Filename:    "demo.txt",
		ContentType: "text/plain",
		SizeBytes:   int64(len(payload)),
		StoragePath: "users/authorized/demo.txt",
		CreatedAt:   time.Now(),
	}

	db := &stubDB{queryRow: func(ctx context.Context, sql string, args ...any) pgx.Row {
		switch {
		case strings.Contains(sql, "FROM attachments WHERE id = $1"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*uuid.UUID)) = attachment.ID
				*(dest[1].(*uuid.NullUUID)) = attachment.MessageID
				*(dest[2].(*uuid.UUID)) = attachment.UserID
				*(dest[3].(*string)) = attachment.Filename
				*(dest[4].(*string)) = attachment.ContentType
				*(dest[5].(*int64)) = attachment.SizeBytes
				*(dest[6].(*string)) = attachment.StoragePath
				*(dest[7].(*pgtype.Text)) = attachment.ThumbnailPath
				*(dest[8].(*time.Time)) = attachment.CreatedAt
				*(dest[9].(*uuid.NullUUID)) = attachment.DirectMessageID
				return nil
			}}
		case strings.Contains(sql, "FROM messages WHERE id = $1"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*uuid.UUID)) = uuid.New()
				*(dest[1].(*uuid.UUID)) = uuid.New()
				*(dest[2].(*uuid.NullUUID)) = uuid.NullUUID{Valid: true, UUID: userID}
				*(dest[3].(*string)) = "body"
				*(dest[4].(*time.Time)) = time.Now()
				*(dest[5].(**time.Time)) = nil
				*(dest[6].(**time.Time)) = nil
				*(dest[7].(*uuid.NullUUID)) = uuid.NullUUID{}
				*(dest[8].(*int32)) = 0
				return nil
			}}
		case strings.Contains(sql, "SELECT EXISTS"):
			return stubQueryRow{fun: func(dest ...any) error {
				*(dest[0].(*bool)) = true
				return nil
			}}
		default:
			return stubQueryRow{fun: func(dest ...any) error { return nil }}
		}
	}}

	store, err := minio.New("example.com", &minio.Options{
		Creds:    credentials.NewStaticV4("test", "test", ""),
		Secure:   false,
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			if req.Method == http.MethodGet && req.URL.Query().Has("location") {
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/xml"}},
					Body:       io.NopCloser(strings.NewReader("<LocationConstraint></LocationConstraint>")),
					Request:    req,
				}, nil
			}
			headers := http.Header{}
			headers.Set("Content-Type", "text/plain")
			headers.Set("Content-Length", strconv.Itoa(len(payload)))
			headers.Set("ETag", `"authorized-test-object"`)
			headers.Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
			if req.Method == http.MethodHead {
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     headers,
					Body:       http.NoBody,
					Request:    req,
				}, nil
			}
			if req.Method == http.MethodGet {
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     headers,
					Body:       io.NopCloser(bytes.NewReader(payload)),
					Request:    req,
				}, nil
			}
			return &http.Response{StatusCode: http.StatusNotFound, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("not found")), Request: req}, nil
		}),
	})
	if err != nil {
		t.Fatalf("create minio client: %v", err)
	}

	h := &Handler{Queries: database.New(db), Store: store, Bucket: "test-bucket"}
	r := chi.NewRouter()
	r.Get("/uploads/{id}", h.Serve)
	req := httptest.NewRequest(http.MethodGet, "/uploads/"+attachmentID.String(), nil)
	ctx := context.WithValue(req.Context(), auth.UserContextKey, &auth.Claims{UserID: userID.String()})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for authorized download, got %d body=%s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != string(payload) {
		t.Fatalf("unexpected authorized response body: %q", got)
	}
}

func TestServeRejectsMissingAuthClaims(t *testing.T) {
	attachmentID := uuid.New()
	h := &Handler{}
	r := chi.NewRouter()
	r.Get("/uploads/{id}", h.Serve)
	req := httptest.NewRequest(http.MethodGet, "/uploads/"+attachmentID.String(), nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing auth claims, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestPrepareRangeResponse(t *testing.T) {
	payload := []byte("abcdefghij")
	t.Run("no range", func(t *testing.T) {
		rec := httptest.NewRecorder()
		if err := prepareRangeResponse(rec, bytes.NewReader(payload), "text/plain", int64(len(payload)), "demo.txt", "", ""); err != nil {
			t.Fatalf("unexpected no-range failure: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Content-Length"); got != "10" {
			t.Fatalf("expected Content-Length 10, got %q", got)
		}
		if got := rec.Body.String(); got != "abcdefghij" {
			t.Fatalf("unexpected body: %q", got)
		}
	})

	t.Run("valid range", func(t *testing.T) {
		rec := httptest.NewRecorder()
		if err := prepareRangeResponse(rec, bytes.NewReader(payload), "text/plain", int64(len(payload)), "demo.txt", "", "bytes=2-5"); err != nil {
			t.Fatalf("unexpected valid range failure: %v", err)
		}
		if rec.Code != http.StatusPartialContent {
			t.Fatalf("expected 206, got %d", rec.Code)
		}
		if got := rec.Header().Get("Content-Range"); got != "bytes 2-5/10" {
			t.Fatalf("expected content range bytes 2-5/10, got %q", got)
		}
		if got := rec.Header().Get("Content-Length"); got != "4" {
			t.Fatalf("expected Content-Length 4, got %q", got)
		}
		if got := rec.Body.String(); got != "cdef" {
			t.Fatalf("unexpected partial body: %q", got)
		}
	})

	t.Run("video range", func(t *testing.T) {
		payload := []byte("0123456789")
		rec := httptest.NewRecorder()
		if err := prepareRangeResponse(rec, bytes.NewReader(payload), "video/mp4", int64(len(payload)), "demo.mp4", "", "bytes=3-7"); err != nil {
			t.Fatalf("unexpected valid video range failure: %v", err)
		}
		if rec.Code != http.StatusPartialContent {
			t.Fatalf("expected 206 for video range, got %d", rec.Code)
		}
		if got := rec.Body.String(); got != "34567" {
			t.Fatalf("unexpected video partial body: %q", got)
		}
	})

	t.Run("invalid range", func(t *testing.T) {
		rec := httptest.NewRecorder()
		if err := prepareRangeResponse(rec, bytes.NewReader(payload), "text/plain", int64(len(payload)), "demo.txt", "", "bytes=100-200"); err == nil {
			t.Fatal("expected invalid range to fail")
		}
		if rec.Code != http.StatusRequestedRangeNotSatisfiable {
			t.Fatalf("expected 416, got %d", rec.Code)
		}
		if got := rec.Header().Get("Content-Range"); got != "bytes */10" {
			t.Fatalf("expected bytes */10, got %q", got)
		}
	})
}
