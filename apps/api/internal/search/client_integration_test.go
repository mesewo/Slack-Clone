package search

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

func TestSearchMessagesIntegrationLifecycle(t *testing.T) {
	t.Run("create and search", func(t *testing.T) {
		var lastBody map[string]any
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/_doc/"):
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Fatalf("read index body: %v", err)
				}
				if err := json.Unmarshal(body, &lastBody); err != nil {
					t.Fatalf("decode index payload: %v", err)
				}
				w.WriteHeader(http.StatusOK)
			case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/_search"):
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Fatalf("read search body: %v", err)
				}
				lastBody = map[string]any{}
				if err := json.Unmarshal(body, &lastBody); err != nil {
					t.Fatalf("decode search payload: %v", err)
				}
				response := map[string]any{
					"hits": map[string]any{
						"hits": []map[string]any{{
							"_id": "msg-1",
							"_source": map[string]any{
								"id":        "msg-1",
								"channel_id": "chan-1",
								"content":   "hello world",
								"author":    "alice",
								"created_at": "2024-01-02T00:00:00Z",
							},
						}},
					},
				}
				if err := json.NewEncoder(w).Encode(response); err != nil {
					t.Fatalf("encode search response: %v", err)
				}
			default:
				w.WriteHeader(http.StatusOK)
			}
		}))
		defer server.Close()

		client := NewClient(server.URL)
		messageID := uuid.New()
		if err := client.IndexMessage(context.Background(), MessageDocument{
			ID:        messageID.String(),
			ChannelID: "chan-1",
			Author:    "alice",
			Content:   "hello world",
			CreatedAt: time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC),
		}); err != nil {
			t.Fatalf("index message: %v", err)
		}
		results, err := client.SearchMessages(context.Background(), "hello", []string{"chan-1"}, 10)
		if err != nil {
			t.Fatalf("search messages: %v", err)
		}
		if len(results) != 1 || results[0].ID != "msg-1" {
			t.Fatalf("expected one search hit, got %#v", results)
		}
		if _, ok := lastBody["query"]; !ok {
			t.Fatal("search request did not contain a query body")
		}
	})

	t.Run("delete and reindex", func(t *testing.T) {
		deleted := false
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodDelete:
				deleted = true
				w.WriteHeader(http.StatusOK)
			case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/_doc/"):
				w.WriteHeader(http.StatusOK)
			default:
				w.WriteHeader(http.StatusOK)
			}
		}))
		defer server.Close()

		client := NewClient(server.URL)
		if err := client.DeleteMessage(context.Background(), "msg-99"); err != nil {
			t.Fatalf("delete message: %v", err)
		}
		if !deleted {
			t.Fatal("delete request was not issued")
		}

		rows := []database.ListMessagesForSearchRow{{
			ID:        uuid.New(),
			ChannelID: uuid.New(),
			UserID:    uuid.NullUUID{Valid: true, UUID: uuid.New()},
			AuthorName: pgtype.Text{String: "alice", Valid: true},
			Content:   "reindexed content",
			CreatedAt: time.Now(),
		}}
		if err := client.Reindex(context.Background(), rows); err != nil {
			t.Fatalf("reindex: %v", err)
		}
	})
}
