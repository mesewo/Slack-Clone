package database

import (
	"context"
	"time"

	"github.com/google/uuid"
)

func (q *Queries) ListChannelMemberIDs(ctx context.Context, channelID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := q.db.Query(ctx, `SELECT user_id FROM channel_members WHERE channel_id = $1`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		items = append(items, id)
	}
	return items, rows.Err()
}

func (q *Queries) ListDirectConversationMemberIDs(ctx context.Context, conversationID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := q.db.Query(ctx, `SELECT user_id FROM direct_conversation_members WHERE conversation_id = $1`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		items = append(items, id)
	}
	return items, rows.Err()
}

func (q *Queries) CreateNotification(ctx context.Context, userID uuid.UUID, title, body, action string, entityID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `INSERT INTO notifications (user_id, title, body, action, entity_id) VALUES ($1, $2, $3, NULLIF($4, ''), $5)`, userID, title, body, action, entityID)
	return err
}

type NotificationRow struct {
	ID        uuid.UUID  `json:"id"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Action    string     `json:"action"`
	EntityID  *uuid.UUID `json:"entity_id"`
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
}

func (q *Queries) ListNotifications(ctx context.Context, userID uuid.UUID) ([]NotificationRow, error) {
	rows, err := q.db.Query(ctx, `SELECT id, title, body, COALESCE(action, ''), entity_id, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]NotificationRow, 0)
	for rows.Next() {
		var item NotificationRow
		if err := rows.Scan(&item.ID, &item.Title, &item.Body, &item.Action, &item.EntityID, &item.ReadAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (q *Queries) MarkNotificationRead(ctx context.Context, id, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (q *Queries) MarkAllNotificationsRead(ctx context.Context, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE user_id = $1`, userID)
	return err
}
