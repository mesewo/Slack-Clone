package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mesewo/slack-clone/services/database"
)

func TestHandleMessageSentLoadsWorkspaceHooksAndDispatches(t *testing.T) {
	channelID, workspaceID := uuid.New(), uuid.New()
	const secret = "workspace-secret"
	event := []byte(`{"event_id":"event-1","message_id":"message-1","channel_id":"` + channelID.String() + `","content":"hello"}`)
	received := make(chan http.Header, 1)
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read webhook body: %v", err)
		}
		mac := hmac.New(sha256.New, []byte(secret))
		_, _ = mac.Write(body)
		if got, want := r.Header.Get(signatureHeader), hex.EncodeToString(mac.Sum(nil)); got != want {
			t.Errorf("signature = %q, want %q", got, want)
		}
		if string(body) != string(event) {
			t.Errorf("body = %q, want %q", body, event)
		}
		received <- r.Header.Clone()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer receiver.Close()

	queries := database.New(&webhookConsumerDB{
		workspaceID: workspaceID,
		webhooks:    []database.WorkspaceWebhook{{ID: uuid.New(), WorkspaceID: workspaceID, Url: receiver.URL, Secret: secret, CreatedAt: time.Now(), UpdatedAt: time.Now()}},
	})
	dispatcher := NewDispatcher(receiver.Client(), 3, time.Second)
	if err := HandleMessageSent(context.Background(), queries, dispatcher, event); err != nil {
		t.Fatalf("HandleMessageSent() error: %v", err)
	}
	select {
	case <-received:
	case <-time.After(time.Second):
		t.Fatal("webhook receiver did not get the message event")
	}
}

func TestHandleMessageSentDoesNotRedeliverSucceededTargetAfterPartialFailure(t *testing.T) {
	channelID, workspaceID := uuid.New(), uuid.New()
	var firstRequests, secondRequests atomic.Int32
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		firstRequests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer first.Close()
	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		secondRequests.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer second.Close()
	firstTarget := database.WorkspaceWebhook{ID: uuid.New(), WorkspaceID: workspaceID, Url: first.URL, Secret: "first-secret"}
	secondTarget := database.WorkspaceWebhook{ID: uuid.New(), WorkspaceID: workspaceID, Url: second.URL, Secret: "second-secret"}
	db := &webhookConsumerDB{workspaceID: workspaceID, webhooks: []database.WorkspaceWebhook{firstTarget, secondTarget}}
	queries := database.New(db)
	dispatcher := NewDispatcher(nil, 100, time.Second)
	event := []byte(`{"event_id":"same-event-id","message_id":"message-2","channel_id":"` + channelID.String() + `","content":"hello"}`)

	if err := HandleMessageSent(context.Background(), queries, dispatcher, event); err == nil {
		t.Fatal("first HandleMessageSent() succeeded, want the second target's 500 failure")
	}
	if got := firstRequests.Load(); got != 1 {
		t.Fatalf("first target requests after initial delivery = %d, want 1", got)
	}
	if err := HandleMessageSent(context.Background(), queries, dispatcher, event); err == nil {
		t.Fatal("second HandleMessageSent() succeeded, want the second target's 500 failure")
	}
	if got := firstRequests.Load(); got != 1 {
		t.Fatalf("first target requests after retry = %d, want exactly 1", got)
	}
	if got, want := secondRequests.Load(), int32(2*maxAttempts); got != want {
		t.Fatalf("second target requests = %d, want %d failed attempts", got, want)
	}
}

type webhookConsumerDB struct {
	workspaceID uuid.UUID
	webhooks    []database.WorkspaceWebhook
	deliveries  map[string]bool
}

func (db *webhookConsumerDB) Exec(_ context.Context, query string, args ...interface{}) (pgconn.CommandTag, error) {
	if !strings.Contains(query, "name: MarkWebhookDelivered") {
		return pgconn.CommandTag{}, nil
	}
	if db.deliveries == nil {
		db.deliveries = make(map[string]bool)
	}
	key := deliveryKey(args[0].(string), args[1].(uuid.UUID))
	if db.deliveries[key] {
		return pgconn.NewCommandTag("INSERT 0 0"), nil
	}
	db.deliveries[key] = true
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func (db *webhookConsumerDB) Query(_ context.Context, query string, args ...interface{}) (pgx.Rows, error) {
	if !strings.Contains(query, "name: ListWorkspaceWebhooks") {
		return nil, nil
	}
	if args[0].(uuid.UUID) != db.workspaceID {
		return nil, nil
	}
	return &webhookConsumerRows{items: db.webhooks}, nil
}

func (db *webhookConsumerDB) QueryRow(_ context.Context, query string, args ...interface{}) pgx.Row {
	if strings.Contains(query, "name: IsWebhookDelivered") {
		return webhookTestValuesRow{values: []interface{}{db.deliveries[deliveryKey(args[0].(string), args[1].(uuid.UUID))]}}
	}
	if !strings.Contains(query, "name: GetChannelWorkspaceID") {
		return webhookTestErrorRow{err: pgx.ErrNoRows}
	}
	return webhookTestValuesRow{values: []interface{}{db.workspaceID}}
}

func deliveryKey(eventID string, webhookID uuid.UUID) string {
	return eventID + "/" + webhookID.String()
}

type webhookConsumerRows struct {
	items []database.WorkspaceWebhook
	index int
	last  database.WorkspaceWebhook
}

func (rows *webhookConsumerRows) Close()                                       {}
func (rows *webhookConsumerRows) Err() error                                   { return nil }
func (rows *webhookConsumerRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (rows *webhookConsumerRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (rows *webhookConsumerRows) Next() bool {
	if rows.index >= len(rows.items) {
		return false
	}
	rows.last = rows.items[rows.index]
	rows.index++
	return true
}
func (rows *webhookConsumerRows) Scan(dest ...interface{}) error {
	return webhookTestValuesRow{values: []interface{}{rows.last.ID, rows.last.WorkspaceID, rows.last.Url, rows.last.Secret, rows.last.CreatedAt, rows.last.UpdatedAt}}.Scan(dest...)
}
func (*webhookConsumerRows) Values() ([]interface{}, error) { return nil, nil }
func (*webhookConsumerRows) RawValues() [][]byte            { return nil }
func (*webhookConsumerRows) Conn() *pgx.Conn                { return nil }
