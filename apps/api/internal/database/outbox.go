package database

import (
	"context"

	"github.com/google/uuid"
)

type OutboxRow struct {
	ID       uuid.UUID
	Topic    string
	EventKey string
	Payload  []byte
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

func (q *Queries) MarkOutboxPublished(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE event_outbox SET published_at = now() WHERE id = $1`, id)
	return err
}
