package database

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:181296@127.0.0.1:5432/slack_db?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Skipf("PostgreSQL unavailable: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("PostgreSQL unavailable: %v", err)
	}
	return pool
}

func TestOutboxClaimConcurrencyAndStaleRecovery(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	ctx := context.Background()
	id := uuid.New()
	topic := "integration.test." + id.String()
	if _, err := pool.Exec(ctx, `INSERT INTO event_outbox (id, topic, event_key, payload) VALUES ($1, $2, $3, '{}'::jsonb)`, id, topic, id.String()); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM event_outbox WHERE id = $1`, id)
	defer pool.Exec(ctx, `DELETE FROM event_outbox WHERE topic = $1`, topic)

	queries := New(pool)
	tokenA := uuid.New()
	tokenB := uuid.New()
	claimedA, err := queries.ClaimPendingOutboxByTopic(ctx, 1, tokenA, topic)
	if err != nil || len(claimedA) != 1 || claimedA[0].ID != id {
		t.Fatalf("publisher A claim failed: %v, rows=%d", err, len(claimedA))
	}
	claimedB, err := queries.ClaimPendingOutboxByTopic(ctx, 1, tokenB, topic)
	if err != nil {
		t.Fatal(err)
	}
	if len(claimedB) != 0 && claimedB[0].ID == id {
		t.Fatal("publisher B claimed an actively owned event")
	}

	if _, err := pool.Exec(ctx, `UPDATE event_outbox SET claimed_at = now() - interval '1 minute' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	claimedB, err = queries.ClaimPendingOutboxByTopic(ctx, 1, tokenB, topic)
	if err != nil || len(claimedB) != 1 || claimedB[0].ID != id {
		t.Fatalf("stale claim was not recoverable: %v, rows=%d", err, len(claimedB))
	}
	if err := queries.MarkOutboxPublished(ctx, id, tokenA); err != nil {
		t.Fatal(err)
	}
	var published *time.Time
	if err := pool.QueryRow(ctx, `SELECT published_at FROM event_outbox WHERE id = $1`, id).Scan(&published); err != nil {
		t.Fatal(err)
	}
	if published != nil {
		t.Fatal("stale publisher was able to acknowledge a reclaimed event")
	}
	if err := queries.MarkOutboxPublished(ctx, id, tokenB); err != nil {
		t.Fatal(err)
	}
}

func TestBusinessAndOutboxCommitAtomically(t *testing.T) {
	pool := integrationPool(t)
	defer pool.Close()
	ctx := context.Background()
	defer pool.Exec(ctx, `DELETE FROM event_outbox WHERE topic = 'integration.message'`)
	userID, workspaceID, channelID := uuid.New(), uuid.New(), uuid.New()
	defer func() {
		pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	}()
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, 'test', 'Integration')`, userID, userID.String()+"@integration.test"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO workspaces (id, name, slug) VALUES ($1, 'Integration', $2)`, workspaceID, workspaceID.String()); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO channels (id, workspace_id, name, type, created_by) VALUES ($1, $2, 'integration', 'PUBLIC', $3)`, channelID, workspaceID, userID); err != nil {
		t.Fatal(err)
	}

	queries := New(pool)
	var messageID uuid.UUID
	if err := queries.InTx(ctx, func(tx *Queries) error {
		message, err := tx.CreateMessage(ctx, CreateMessageParams{ChannelID: channelID, UserID: uuid.NullUUID{UUID: userID, Valid: true}, Content: "atomic"})
		if err != nil {
			return err
		}
		messageID = message.ID
		return tx.EnqueueOutbox(ctx, "integration.message", message.ID.String(), []byte(`{"event_id":"atomic"}`))
	}); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE id = $1`, messageID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("message was not committed: %v count=%d", err, count)
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM event_outbox WHERE event_key = $1`, messageID.String()).Scan(&count); err != nil || count != 1 {
		t.Fatalf("outbox was not committed: %v count=%d", err, count)
	}

	failedMessageID := uuid.New()
	if err := queries.InTx(ctx, func(tx *Queries) error {
		if _, err := tx.CreateMessage(ctx, CreateMessageParams{ChannelID: channelID, UserID: uuid.NullUUID{UUID: userID, Valid: true}, Content: "rollback"}); err != nil {
			return err
		}
		return context.Canceled
	}); err == nil {
		t.Fatal("expected forced transaction failure")
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE content = 'rollback'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rollback left business state: %v count=%d", err, count)
	}
	_ = failedMessageID
}
