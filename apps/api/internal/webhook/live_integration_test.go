package webhook

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	segmentkafka "github.com/segmentio/kafka-go"

	"github.com/mesewo/slack-clone/apps/api/internal/kafka"
	"github.com/mesewo/slack-clone/services/database"
)

func TestLiveMessageSentPartialWebhookDelivery(t *testing.T) {
	if os.Getenv("WEBHOOK_LIVE_INTEGRATION") != "1" {
		t.Skip("set WEBHOOK_LIVE_INTEGRATION=1 to run with local PostgreSQL, Redis, and Kafka")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required for the live webhook integration test")
	}
	broker := os.Getenv("KAFKA_BROKER_ADDR")
	if broker == "" {
		broker = "localhost:19092"
	}
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect to PostgreSQL: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping PostgreSQL: %v", err)
	}

	workspaceID, channelID := uuid.New(), uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO workspaces (id, name, slug) VALUES ($1, $2, $3)`, workspaceID, "Webhook live test", "webhook-live-"+workspaceID.String())
	if err != nil {
		t.Fatalf("create temporary workspace: %v", err)
	}
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		if _, cleanupErr := pool.Exec(cleanupCtx, `DELETE FROM workspaces WHERE id = $1`, workspaceID); cleanupErr != nil {
			t.Errorf("clean up temporary workspace: %v", cleanupErr)
		}
	}()
	_, err = pool.Exec(ctx, `INSERT INTO channels (id, workspace_id, name, type) VALUES ($1, $2, $3, 'PUBLIC')`, channelID, workspaceID, "webhook-live-"+channelID.String())
	if err != nil {
		t.Fatalf("create temporary channel: %v", err)
	}

	var successRequests, failureRequests atomic.Int32
	successReceiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		successRequests.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer successReceiver.Close()
	failureReceiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		failureRequests.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer failureReceiver.Close()

	var successfulWebhookID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO workspace_webhooks (workspace_id, url, secret) VALUES ($1, $2, $3) RETURNING id`, workspaceID, successReceiver.URL, "success-secret").Scan(&successfulWebhookID); err != nil {
		t.Fatalf("create successful webhook target: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO workspace_webhooks (workspace_id, url, secret) VALUES ($1, $2, $3)`, workspaceID, failureReceiver.URL, "failure-secret"); err != nil {
		t.Fatalf("create failing webhook target: %v", err)
	}

	redisClient := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer redisClient.Close()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		t.Fatalf("ping Redis: %v", err)
	}

	topic := "test.webhook.live." + strings.ReplaceAll(uuid.NewString(), "-", "")
	groupID := "test.webhook.live.group." + strings.ReplaceAll(uuid.NewString(), "-", "")
	dedupPrefix := "dedup:webhook_live:" + uuid.NewString() + ":"
	queries := database.New(pool)
	dispatcher := NewDispatcher(nil, 100, time.Second)
	startConsumer := func() (*liveWebhookConsumer, <-chan error) {
		consumer := kafka.NewConsumer(broker, topic, groupID, redisClient)
		consumerCtx, stop := context.WithCancel(ctx)
		done := make(chan struct{})
		handlerErrors := make(chan error, 1)
		run := &liveWebhookConsumer{consumer: consumer, stop: stop, done: done}
		go func() {
			defer close(done)
			consumer.Run(consumerCtx, dedupPrefix, func(raw []byte) (string, error) {
				return kafka.EventDedupKey(topic, raw)
			}, func(raw []byte) error {
				err := HandleMessageSent(consumerCtx, queries, dispatcher, raw)
				if err != nil {
					select {
					case handlerErrors <- err:
					default:
					}
				}
				return err
			})
		}()
		t.Cleanup(func() { run.stopAndWait(t) })
		return run, handlerErrors
	}

	event := kafka.MessageCreatedEvent{
		EventID: "webhook-live-" + uuid.NewString(), Version: 1, Source: "integration-test",
		MessageID: uuid.NewString(), ChannelID: channelID.String(), UserID: uuid.NewString(),
		Content: "live partial-delivery verification", CreatedAt: time.Now().UTC(),
	}
	payload, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	writer := &segmentkafka.Writer{
		Addr:                   segmentkafka.TCP(broker),
		Topic:                  topic,
		Balancer:               &segmentkafka.Hash{},
		RequiredAcks:           segmentkafka.RequireOne,
		WriteTimeout:           10 * time.Second,
		AllowAutoTopicCreation: true,
	}
	defer writer.Close()
	firstConsumer, firstErrors := startConsumer()
	if err := writer.WriteMessages(ctx, segmentkafka.Message{Key: []byte(event.EventID), Value: payload}); err != nil {
		t.Fatalf("publish message-sent event to Kafka: %v", err)
	}

	select {
	case err := <-firstErrors:
		t.Logf("first Kafka delivery left the event uncommitted: %v", err)
	case <-time.After(20 * time.Second):
		t.Fatalf("first Kafka delivery did not reach the failing receiver: successful=%d failed=%d", successRequests.Load(), failureRequests.Load())
	}
	if got := successRequests.Load(); got != 1 {
		t.Fatalf("successful target received %d requests after first pass, want 1", got)
	}
	firstConsumer.stopAndWait(t)

	_, secondErrors := startConsumer()
	select {
	case err := <-secondErrors:
		t.Logf("redelivered Kafka event still fails only at the failing receiver: %v", err)
	case <-time.After(20 * time.Second):
		t.Fatalf("Kafka group did not redeliver the uncommitted event: successful=%d failed=%d", successRequests.Load(), failureRequests.Load())
	}
	var ledgerEntries int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM webhook_deliveries WHERE event_id = $1 AND webhook_id = $2`, event.EventID, successfulWebhookID).Scan(&ledgerEntries); err != nil {
		t.Fatalf("query successful target ledger row: %v", err)
	}
	if ledgerEntries != 1 {
		t.Fatalf("successful target ledger entries = %d, want 1", ledgerEntries)
	}
	if got := successRequests.Load(); got != 1 {
		t.Fatalf("successful target received %d requests across consumer restart, want exactly 1", got)
	}
	t.Logf("live Kafka event %s: successful target requests=%d, failing target requests=%d, successful ledger entries=%d", event.EventID, successRequests.Load(), failureRequests.Load(), ledgerEntries)
}

type liveWebhookConsumer struct {
	consumer *kafka.Consumer
	stop     context.CancelFunc
	done     <-chan struct{}
	close    sync.Once
}

func (run *liveWebhookConsumer) stopAndWait(t *testing.T) {
	t.Helper()
	run.close.Do(func() {
		run.stop()
		_ = run.consumer.Close()
	})
	select {
	case <-run.done:
	case <-time.After(5 * time.Second):
		t.Error("webhook Kafka consumer did not stop")
	}
}
