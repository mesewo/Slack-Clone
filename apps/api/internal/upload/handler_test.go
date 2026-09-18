package upload

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
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
