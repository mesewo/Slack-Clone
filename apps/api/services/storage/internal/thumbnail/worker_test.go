package thumbnail

import "testing"

func TestThumbnailResultState(t *testing.T) {
	if next, retry := thumbnailResultState("UPLOADED", 0, true); next != "READY" || retry {
		t.Fatalf("successful upload should finalize as READY: next=%s retry=%v", next, retry)
	}
	if next, retry := thumbnailResultState("PROCESSING", 1, false); next != "PROCESSING" || !retry {
		t.Fatalf("retryable failure should remain PROCESSING: next=%s retry=%v", next, retry)
	}
	if next, retry := thumbnailResultState("PROCESSING", 3, false); next != "FAILED" || retry {
		t.Fatalf("final retry failure should mark FAILED: next=%s retry=%v", next, retry)
	}
}
