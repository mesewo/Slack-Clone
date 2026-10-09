package server

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestValidatePresignRequest(t *testing.T) {
	if _, _, _, err := validatePresignRequest("report.pdf", "application/pdf", 1024); err != nil {
		t.Fatalf("valid presign request should pass: %v", err)
	}
	for _, test := range []struct {
		name, filename, contentType string
		size                        int64
	}{
		{name: "empty filename", filename: "", contentType: "application/pdf", size: 1024},
		{name: "unsupported type", filename: "malware.exe", contentType: "application/x-msdownload", size: 1024},
		{name: "oversized", filename: "too-large.bin", contentType: "application/octet-stream", size: maxUploadSize + 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, _, _, err := validatePresignRequest(test.filename, test.contentType, test.size); err == nil {
				t.Fatal("invalid presign request should be rejected")
			}
		})
	}
}

func TestSafeUploadKeyDoesNotExposeRawPath(t *testing.T) {
	key := safeUploadKey("user-123", "../../secret.txt")
	if strings.Contains(key, "../") || filepath.Base(key) != "secret.txt" {
		t.Fatalf("unsafe object key: %q", key)
	}
}
