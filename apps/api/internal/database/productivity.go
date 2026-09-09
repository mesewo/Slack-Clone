package database

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type ProfileSettings struct {
	ID             uuid.UUID `json:"id"`
	Email          string    `json:"email"`
	DisplayName    string    `json:"display_name"`
	AvatarURL      string    `json:"avatar_url"`
	PresenceStatus string    `json:"presence_status"`
}

type SavedMessageRow struct {
	MessageID      uuid.UUID  `json:"message_id"`
	ChannelID      *uuid.UUID `json:"channel_id,omitempty"`
	ConversationID *uuid.UUID `json:"conversation_id,omitempty"`
	Content        string     `json:"content"`
	CreatedAt      time.Time  `json:"created_at"`
}

type ScheduledMessageRow struct {
	ID             uuid.UUID  `json:"id"`
	ChannelID      *uuid.UUID `json:"channel_id,omitempty"`
	ConversationID *uuid.UUID `json:"conversation_id,omitempty"`
	UserID         uuid.UUID  `json:"user_id"`
	Content        string     `json:"content"`
	ScheduledFor   time.Time  `json:"scheduled_for"`
	SentAt         *time.Time `json:"sent_at,omitempty"`
}

type NotificationPreferences struct {
	Mentions       bool `json:"mentions"`
	DirectMessages bool `json:"direct_messages"`
	ThreadReplies  bool `json:"thread_replies"`
	Reactions      bool `json:"reactions"`
}

func (q *Queries) GetProfileSettings(ctx context.Context, userID uuid.UUID) (ProfileSettings, error) {
	var item ProfileSettings
	err := q.db.QueryRow(ctx, `SELECT id, email, display_name, avatar_url, presence_status FROM users WHERE id = $1`, userID).Scan(&item.ID, &item.Email, &item.DisplayName, &item.AvatarURL, &item.PresenceStatus)
	return item, err
}

func (q *Queries) UpdateProfileSettings(ctx context.Context, userID uuid.UUID, displayName, avatarURL, presence string) (ProfileSettings, error) {
	var item ProfileSettings
	err := q.db.QueryRow(ctx, `UPDATE users SET display_name = COALESCE(NULLIF($2, ''), display_name), avatar_url = COALESCE($3, avatar_url), presence_status = COALESCE(NULLIF($4, ''), presence_status), updated_at = now() WHERE id = $1 RETURNING id, email, display_name, avatar_url, presence_status`, userID, displayName, avatarURL, presence).Scan(&item.ID, &item.Email, &item.DisplayName, &item.AvatarURL, &item.PresenceStatus)
	return item, err
}

func (q *Queries) ListSavedMessages(ctx context.Context, userID uuid.UUID) ([]SavedMessageRow, error) {
	rows, err := q.db.Query(ctx, `SELECT s.message_id, m.channel_id, NULL::uuid, m.content, s.created_at FROM saved_messages s JOIN messages m ON m.id = s.message_id WHERE s.user_id = $1 UNION ALL SELECT s.message_id, NULL::uuid, d.conversation_id, d.content, s.created_at FROM saved_messages s JOIN direct_messages d ON d.id = s.message_id WHERE s.user_id = $1 ORDER BY created_at DESC`, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []SavedMessageRow{}
	for rows.Next() {
		var item SavedMessageRow
		if err := rows.Scan(&item.MessageID, &item.ChannelID, &item.ConversationID, &item.Content, &item.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (q *Queries) SaveMessage(ctx context.Context, userID, messageID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `INSERT INTO saved_messages (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, userID, messageID)
	return err
}
func (q *Queries) UnsaveMessage(ctx context.Context, userID, messageID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM saved_messages WHERE user_id = $1 AND message_id = $2`, userID, messageID)
	return err
}
func (q *Queries) SubscribeThread(ctx context.Context, userID, messageID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `INSERT INTO thread_subscriptions (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, userID, messageID)
	return err
}
func (q *Queries) UnsubscribeThread(ctx context.Context, userID, messageID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM thread_subscriptions WHERE user_id = $1 AND message_id = $2`, userID, messageID)
	return err
}

func (q *Queries) GetNotificationPreferences(ctx context.Context, userID uuid.UUID) (NotificationPreferences, error) {
	var item NotificationPreferences
	err := q.db.QueryRow(ctx, `INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING mentions, direct_messages, thread_replies, reactions`, userID).Scan(&item.Mentions, &item.DirectMessages, &item.ThreadReplies, &item.Reactions)
	return item, err
}
func (q *Queries) UpdateNotificationPreferences(ctx context.Context, userID uuid.UUID, item NotificationPreferences) error {
	_, err := q.db.Exec(ctx, `INSERT INTO notification_preferences (user_id, mentions, direct_messages, thread_replies, reactions, updated_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (user_id) DO UPDATE SET mentions = EXCLUDED.mentions, direct_messages = EXCLUDED.direct_messages, thread_replies = EXCLUDED.thread_replies, reactions = EXCLUDED.reactions, updated_at = now()`, userID, item.Mentions, item.DirectMessages, item.ThreadReplies, item.Reactions)
	return err
}

func (q *Queries) CreateScheduledMessage(ctx context.Context, userID uuid.UUID, channelID, conversationID *uuid.UUID, content string, scheduledFor time.Time) (ScheduledMessageRow, error) {
	var item ScheduledMessageRow
	err := q.db.QueryRow(ctx, `INSERT INTO scheduled_messages (channel_id, conversation_id, user_id, content, scheduled_for) VALUES ($1, $2, $3, $4, $5) RETURNING id, channel_id, conversation_id, user_id, content, scheduled_for, sent_at`, channelID, conversationID, userID, content, scheduledFor).Scan(&item.ID, &item.ChannelID, &item.ConversationID, &item.UserID, &item.Content, &item.ScheduledFor, &item.SentAt)
	return item, err
}

func (q *Queries) ClaimDueScheduledMessages(ctx context.Context, limit int) ([]ScheduledMessageRow, error) {
	rows, err := q.db.Query(ctx, `WITH due AS (SELECT id FROM scheduled_messages WHERE sent_at IS NULL AND scheduled_for <= now() ORDER BY scheduled_for FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE scheduled_messages s SET sent_at = now() FROM due WHERE s.id = due.id RETURNING s.id, s.channel_id, s.conversation_id, s.user_id, s.content, s.scheduled_for, s.sent_at`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []ScheduledMessageRow{}
	for rows.Next() {
		var item ScheduledMessageRow
		if err := rows.Scan(&item.ID, &item.ChannelID, &item.ConversationID, &item.UserID, &item.Content, &item.ScheduledFor, &item.SentAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}
