package database

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type OutboxRow struct {
	ID         uuid.UUID
	Topic      string
	EventKey   string
	Payload    []byte
	ClaimToken uuid.UUID
}

func (q *Queries) EnqueueOutbox(ctx context.Context, topic, eventKey string, payload []byte) error {
	_, err := q.db.Exec(ctx, `INSERT INTO event_outbox (topic, event_key, payload) VALUES ($1, $2, $3::jsonb)`, topic, eventKey, payload)
	return err
}

func (q *Queries) ListPendingOutbox(ctx context.Context, limit int32) ([]OutboxRow, error) {
	rows, err := q.db.Query(ctx, `SELECT id, topic, event_key, payload FROM event_outbox WHERE published_at IS NULL ORDER BY created_at LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]OutboxRow, 0)
	for rows.Next() {
		var item OutboxRow
		if err := rows.Scan(&item.ID, &item.Topic, &item.EventKey, &item.Payload); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) ClaimPendingOutbox(ctx context.Context, limit int32, token uuid.UUID) ([]OutboxRow, error) {
	rows, err := q.db.Query(ctx, `
		WITH candidates AS (
			SELECT id
			FROM event_outbox
			WHERE published_at IS NULL
			  AND (claimed_at IS NULL OR claimed_at < $2)
			ORDER BY created_at
			FOR UPDATE SKIP LOCKED
			LIMIT $1
		)
		UPDATE event_outbox AS outbox
		SET claimed_at = now(), claim_token = $3, attempts = attempts + 1
		FROM candidates
		WHERE outbox.id = candidates.id
		RETURNING outbox.id, outbox.topic, outbox.event_key, outbox.payload, outbox.claim_token`,
		limit, time.Now().Add(-30*time.Second), token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]OutboxRow, 0)
	for rows.Next() {
		var item OutboxRow
		if err := rows.Scan(&item.ID, &item.Topic, &item.EventKey, &item.Payload, &item.ClaimToken); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) ClaimPendingOutboxByTopic(ctx context.Context, limit int32, token uuid.UUID, topic string) ([]OutboxRow, error) {
	rows, err := q.db.Query(ctx, `
		WITH candidates AS (
			SELECT id
			FROM event_outbox
			WHERE topic = $1 AND published_at IS NULL
			  AND (claimed_at IS NULL OR claimed_at < $3)
			ORDER BY created_at
			FOR UPDATE SKIP LOCKED
			LIMIT $2
		)
		UPDATE event_outbox AS outbox
		SET claimed_at = now(), claim_token = $4, attempts = attempts + 1
		FROM candidates
		WHERE outbox.id = candidates.id
		RETURNING outbox.id, outbox.topic, outbox.event_key, outbox.payload, outbox.claim_token`,
		topic, limit, time.Now().Add(-30*time.Second), token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]OutboxRow, 0)
	for rows.Next() {
		var item OutboxRow
		if err := rows.Scan(&item.ID, &item.Topic, &item.EventKey, &item.Payload, &item.ClaimToken); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) MarkOutboxPublished(ctx context.Context, id, token uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE event_outbox SET published_at = now(), claimed_at = NULL WHERE id = $1 AND claim_token = $2`, id, token)
	return err
}

func (q *Queries) ReleaseOutboxClaim(ctx context.Context, id, token uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE event_outbox SET claimed_at = NULL, claim_token = NULL WHERE id = $1 AND claim_token = $2`, id, token)
	return err
}
