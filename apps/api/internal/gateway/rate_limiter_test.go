package gateway

import (
	"testing"
	"time"
)

func TestShouldAllowSlidingWindow(t *testing.T) {
	entries := []int64{1000, 2000}
	if !shouldAllowSlidingWindow(entries, 5000, 3, 10*time.Second) {
		t.Fatal("expected the next request to be allowed when the window is below its limit")
	}

	entries = []int64{1000, 2000, 3000}
	if shouldAllowSlidingWindow(entries, 5000, 3, 10*time.Second) {
		t.Fatal("expected the next request to be rejected when the window is already at capacity")
	}

	entries = []int64{1000, 2000, 3000}
	if !shouldAllowSlidingWindow(entries, 5000, 3, 2*time.Second) {
		t.Fatal("expected stale entries outside the window to fall out and permit new traffic")
	}
}
