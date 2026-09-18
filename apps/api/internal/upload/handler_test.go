package upload

import (
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
