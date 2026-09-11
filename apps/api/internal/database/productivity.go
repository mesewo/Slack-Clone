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

type ThreadSummary struct {
	ID             uuid.UUID  `json:"id"`
	Kind           string     `json:"kind"`
	ChannelID      *uuid.UUID `json:"channel_id,omitempty"`
	ConversationID *uuid.UUID `json:"conversation_id,omitempty"`
	Title          string     `json:"title"`
	Preview        string     `json:"preview"`
	ReplyCount     int32      `json:"reply_count"`
	LastActivity   time.Time  `json:"last_activity"`
}

func (q *Queries) ListThreadsForUser(ctx context.Context, userID uuid.UUID) ([]ThreadSummary, error) {
	rows, err := q.db.Query(ctx, `
		WITH channel_threads AS (
			SELECT parent.id, 'channel' AS kind, parent.channel_id, NULL::uuid AS conversation_id,
			       '#' || c.name AS title, parent.content AS preview, parent.reply_count,
			       GREATEST(parent.created_at, COALESCE(MAX(reply.created_at), parent.created_at)) AS last_activity
			FROM messages parent
			JOIN channels c ON c.id = parent.channel_id
			JOIN channel_members cm ON cm.channel_id = parent.channel_id AND cm.user_id = $1
			LEFT JOIN messages reply ON reply.parent_id = parent.id AND reply.deleted_at IS NULL
			WHERE parent.parent_id IS NULL
			  AND (parent.user_id = $1 OR EXISTS (SELECT 1 FROM messages mine WHERE mine.parent_id = parent.id AND mine.user_id = $1) OR EXISTS (SELECT 1 FROM thread_subscriptions ts WHERE ts.message_id = parent.id AND ts.user_id = $1))
			GROUP BY parent.id, c.name
		), dm_threads AS (
			SELECT parent.id, 'dm' AS kind, NULL::uuid AS channel_id, parent.conversation_id,
			       'Direct message' AS title, parent.content AS preview, parent.reply_count,
			       GREATEST(parent.created_at, COALESCE(MAX(reply.created_at), parent.created_at)) AS last_activity
			FROM direct_messages parent
			JOIN direct_conversation_members member ON member.conversation_id = parent.conversation_id AND member.user_id = $1
			LEFT JOIN direct_messages reply ON reply.parent_id = parent.id AND reply.deleted_at IS NULL
			WHERE parent.parent_id IS NULL
			  AND (parent.user_id = $1 OR EXISTS (SELECT 1 FROM direct_messages mine WHERE mine.parent_id = parent.id AND mine.user_id = $1))
			GROUP BY parent.id
		)
		SELECT id, kind, channel_id, conversation_id, title, preview, reply_count, last_activity
		FROM (SELECT * FROM channel_threads UNION ALL SELECT * FROM dm_threads) threads
		ORDER BY last_activity DESC LIMIT 100`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []ThreadSummary
	for rows.Next() {
		var item ThreadSummary
		if err := rows.Scan(&item.ID, &item.Kind, &item.ChannelID, &item.ConversationID, &item.Title, &item.Preview, &item.ReplyCount, &item.LastActivity); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
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

func (q *Queries) NotificationEnabled(ctx context.Context, userID uuid.UUID, preference string) (bool, error) {
	preferences, err := q.GetNotificationPreferences(ctx, userID)
	if err != nil {
		return false, err
	}
	switch preference {
	case "mentions":
		return preferences.Mentions, nil
	case "direct_messages":
		return preferences.DirectMessages, nil
	case "thread_replies":
		return preferences.ThreadReplies, nil
	case "reactions":
		return preferences.Reactions, nil
	default:
		return false, nil
	}
}

func (q *Queries) ListThreadSubscriberIDs(ctx context.Context, messageID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := q.db.Query(ctx, `SELECT user_id FROM thread_subscriptions WHERE message_id = $1`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
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
