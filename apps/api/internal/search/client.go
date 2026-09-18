package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

const indexName = "messages"

type Client struct {
	baseURL    string
	httpClient *http.Client
}

type MessageDocument struct {
	ID        string    `json:"id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id,omitempty"`
	Author    string    `json:"author"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type Result struct {
	ID        string    `json:"id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id,omitempty"`
	Author    string    `json:"author"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *Client) EnsureIndex(ctx context.Context) error {
	body := strings.NewReader(`{"mappings":{"properties":{"channel_id":{"type":"keyword"},"user_id":{"type":"keyword"},"author":{"type":"text"},"content":{"type":"text"},"created_at":{"type":"date"}}}}`)
	status, response, err := c.request(ctx, http.MethodPut, "/"+indexName, body, "application/json")
	if err != nil {
		return err
	}
	if status >= 300 && status != http.StatusBadRequest {
		return fmt.Errorf("create search index: %d: %s", status, response)
	}
	return nil
}

func (c *Client) IndexMessage(ctx context.Context, message MessageDocument) error {
	body, err := json.Marshal(message)
	if err != nil {
		return err
	}
	status, response, err := c.request(ctx, http.MethodPut, "/"+indexName+"/_doc/"+message.ID, bytes.NewReader(body), "application/json")
	if err != nil {
		return err
	}
	if status >= 300 {
		return fmt.Errorf("index message: %d: %s", status, response)
	}
	return nil
}

func (c *Client) Reindex(ctx context.Context, rows []database.ListMessagesForSearchRow) error {
	for _, row := range rows {
		author := ""
		if row.AuthorName.Valid {
			author = row.AuthorName.String
		}
		if err := c.IndexMessage(ctx, ToDocument(database.Message{
			ID:        row.ID,
			ChannelID: row.ChannelID,
			UserID:    row.UserID,
			Content:   row.Content,
			CreatedAt: row.CreatedAt,
		}, author)); err != nil {
			return fmt.Errorf("reindex message %s: %w", row.ID, err)
		}
	}
	return nil
}

func (c *Client) DeleteMessage(ctx context.Context, messageID string) error {
	status, response, err := c.request(ctx, http.MethodDelete, "/"+indexName+"/_doc/"+messageID, nil, "")
	if err != nil {
		return err
	}
	if status >= 300 && status != http.StatusNotFound {
		return fmt.Errorf("delete indexed message: %d: %s", status, response)
	}
	return nil
}

func (c *Client) SearchMessages(ctx context.Context, query string, channelIDs []string, limit int, cursor ...string) ([]Result, error) {
	searchBody := map[string]any{
		"size": limit,
		"query": map[string]any{
			"bool": map[string]any{
				"must":   []any{map[string]any{"multi_match": map[string]any{"query": query, "fields": []string{"content^3", "author"}}}},
				"filter": []any{map[string]any{"terms": map[string]any{"channel_id": channelIDs}}},
			},
		},
		"sort": []any{map[string]any{"created_at": "desc"}, map[string]any{"_id": "desc"}},
	}
	if len(cursor) > 0 && cursor[0] != "" {
		searchBody["search_after"] = []any{cursor[0]}
	}
	body, err := json.Marshal(searchBody)
	if err != nil {
		return nil, err
	}

	status, response, err := c.request(ctx, http.MethodPost, "/"+indexName+"/_search", bytes.NewReader(body), "application/json")
	if err != nil {
		return nil, err
	}
	if status >= 300 {
		return nil, fmt.Errorf("search messages: %d: %s", status, response)
	}

	var parsed struct {
		Hits struct {
			Hits []struct {
				ID     string `json:"_id"`
				Source Result `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.Unmarshal([]byte(response), &parsed); err != nil {
		return nil, err
	}
	results := make([]Result, 0, len(parsed.Hits.Hits))
	for _, hit := range parsed.Hits.Hits {
		hit.Source.ID = hit.ID
		results = append(results, hit.Source)
	}
	return results, nil
}

func ToDocument(message database.Message, author string) MessageDocument {
	document := MessageDocument{
		ID: message.ID.String(), ChannelID: message.ChannelID.String(), Content: message.Content,
		Author: author, CreatedAt: message.CreatedAt,
	}
	if message.UserID.Valid {
		document.UserID = message.UserID.UUID.String()
	}
	return document
}

func (c *Client) request(ctx context.Context, method, path string, body io.Reader, contentType string) (int, string, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return 0, "", err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer res.Body.Close()
	response, err := io.ReadAll(res.Body)
	return res.StatusCode, string(response), err
}
