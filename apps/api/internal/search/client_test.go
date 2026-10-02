package search

import (
	"context"
	"encoding/base64"
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
	cursorValues, _ := json.Marshal([]any{"2024-01-01T00:00:00Z", "msg-1"})
	results, _, err := client.SearchMessages(context.Background(), "hello", []string{"chan-1"}, 10, base64.StdEncoding.EncodeToString(cursorValues))
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	searchAfter, ok := received["search_after"].([]any)
	if !ok || len(searchAfter) != 2 || searchAfter[0] != "2024-01-01T00:00:00Z" || searchAfter[1] != "msg-1" {
		t.Fatalf("search_after not propagated: %#v", received["search_after"])
	}
	if results[0].CreatedAt != time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC) {
		t.Fatalf("created_at not decoded: %v", results[0].CreatedAt)
	}
}

func TestSearchMessagesLoadsDistinctSecondPage(t *testing.T) {
	var requests []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		var request map[string]any
		if err := json.Unmarshal(body, &request); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		requests = append(requests, request)
		w.Header().Set("Content-Type", "application/json")
		if len(requests) == 1 {
			_, _ = io.WriteString(w, `{"hits":{"hits":[{"_id":"message-3","_source":{"channel_id":"channel-1","content":"matching result 3","author":"alice","created_at":"2026-10-02T12:00:00Z"},"sort":["2026-10-02T12:00:00Z","message-3"]},{"_id":"message-2","_source":{"channel_id":"channel-1","content":"matching result 2","author":"alice","created_at":"2026-10-02T11:00:00Z"},"sort":["2026-10-02T11:00:00Z","message-2"]}]}}`)
			return
		}
		_, _ = io.WriteString(w, `{"hits":{"hits":[{"_id":"message-1","_source":{"channel_id":"channel-1","content":"matching result 1","author":"alice","created_at":"2026-10-02T10:00:00Z"},"sort":["2026-10-02T10:00:00Z","message-1"]}]}}`)
	}))
	defer server.Close()

	client := NewClient(server.URL)
	first, cursor, err := client.SearchMessages(context.Background(), "matching", []string{"channel-1"}, 2)
	if err != nil {
		t.Fatalf("first search failed: %v", err)
	}
	if len(first) != 2 || cursor == "" {
		t.Fatalf("expected a full first page and cursor, results=%d cursor=%q", len(first), cursor)
	}

	second, nextCursor, err := client.SearchMessages(context.Background(), "matching", []string{"channel-1"}, 2, cursor)
	if err != nil {
		t.Fatalf("second search failed: %v", err)
	}
	if len(second) != 1 || second[0].ID != "message-1" {
		t.Fatalf("expected the next distinct result, got %#v", second)
	}
	if nextCursor != "" {
		t.Fatalf("expected no cursor after the final page, got %q", nextCursor)
	}
	if second[0].ID == first[0].ID || second[0].ID == first[1].ID {
		t.Fatalf("second page repeated a first-page result: first=%v second=%v", first, second)
	}
	searchAfter, ok := requests[1]["search_after"].([]any)
	if !ok || len(searchAfter) != 2 || searchAfter[0] != "2026-10-02T11:00:00Z" || searchAfter[1] != "message-2" {
		t.Fatalf("second page did not use the first page's final sort values: %#v", requests[1]["search_after"])
	}
}

func TestSearchMessagesUsesStableCompoundSort(t *testing.T) {
	var requests []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		var request map[string]any
		if err := json.Unmarshal(body, &request); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		requests = append(requests, request)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"hits":{"hits":[{"_id":"message-b","_source":{"id":"message-b","channel_id":"chan-1","content":"same timestamp b","author":"alice","created_at":"2024-01-01T00:00:00Z"}},{"_id":"message-a","_source":{"id":"message-a","channel_id":"chan-1","content":"same timestamp a","author":"alice","created_at":"2024-01-01T00:00:00Z"}}]}}`)
	}))
	defer server.Close()

	client := NewClient(server.URL)
	first, _, err := client.SearchMessages(context.Background(), "same timestamp", []string{"chan-1"}, 10)
	if err != nil {
		t.Fatalf("first search failed: %v", err)
	}
	second, _, err := client.SearchMessages(context.Background(), "same timestamp", []string{"chan-1"}, 10)
	if err != nil {
		t.Fatalf("second search failed: %v", err)
	}
	if len(requests) != 2 || len(first) != 2 || len(second) != 2 {
		t.Fatalf("expected two identical two-result searches, requests=%d first=%d second=%d", len(requests), len(first), len(second))
	}
	for _, request := range requests {
		sort, ok := request["sort"].([]any)
		if !ok || len(sort) != 2 {
			t.Fatalf("expected compound sort, got %#v", request["sort"])
		}
		if sort[0].(map[string]any)["created_at"] != "desc" || sort[1].(map[string]any)["id"] != "desc" {
			t.Fatalf("unexpected compound sort: %#v", sort)
		}
	}
	if first[0].ID != second[0].ID || first[1].ID != second[1].ID || first[0].ID != "message-b" || first[1].ID != "message-a" {
		t.Fatalf("same-timestamp order was not repeatable: first=%v second=%v", first, second)
	}
}
