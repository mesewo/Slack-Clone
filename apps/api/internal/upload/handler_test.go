package upload

import "testing"

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
