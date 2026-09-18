package search

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSearchMessagesCursor(t *testing.T) {
	var received map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		if err := json.Unmarshal(body, &received); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"hits":{"hits":[{"_id":"msg-2","_source":{"id":"msg-2","channel_id":"chan-1","content":"second result","author":"alice","created_at":"2024-01-02T00:00:00Z"}}]}}`)
	}))
	defer server.Close()

	client := NewClient(server.URL)
	results, err := client.SearchMessages(context.Background(), "hello", []string{"chan-1"}, 10, "2024-01-01T00:00:00Z")
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	searchAfter, ok := received["search_after"].([]any)
	if !ok || len(searchAfter) != 1 || searchAfter[0] != "2024-01-01T00:00:00Z" {
		t.Fatalf("search_after not propagated: %#v", received["search_after"])
	}
	if results[0].CreatedAt != time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC) {
		t.Fatalf("created_at not decoded: %v", results[0].CreatedAt)
	}
}
