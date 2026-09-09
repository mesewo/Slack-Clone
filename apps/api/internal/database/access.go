package database

import (
	"context"

	"github.com/google/uuid"
)

type UnreadCountParams struct {
	ChannelID uuid.UUID `json:"channel_id"`
	UserID    uuid.UUID `json:"user_id"`
}

func (q *Queries) GetChannelByID(ctx context.Context, id uuid.UUID) (Channel, error) {
	var channel Channel
	err := q.db.QueryRow(ctx, `SELECT id, workspace_id, name, type, created_by, created_at FROM channels WHERE id = $1`, id).Scan(
		&channel.ID, &channel.WorkspaceID, &channel.Name, &channel.Type, &channel.CreatedBy, &channel.CreatedAt,
	)
	return channel, err
}

func (q *Queries) CountUnreadChannelMessages(ctx context.Context, arg UnreadCountParams) (int64, error) {
	var count int64
	err := q.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM messages m
		JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
		WHERE m.channel_id = $1 AND m.deleted_at IS NULL AND m.created_at > cm.last_read_at AND (m.user_id IS NULL OR m.user_id <> $2)
	`, arg.ChannelID, arg.UserID).Scan(&count)
	return count, err
}

func (q *Queries) UpdateDirectConversationLastRead(ctx context.Context, conversationID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `
		UPDATE direct_conversation_members SET last_read_at = now()
		WHERE conversation_id = $1 AND user_id = $2
	`, conversationID, userID)
	return err
}

func (q *Queries) CountUnreadDirectMessages(ctx context.Context, conversationID, userID uuid.UUID) (int64, error) {
	var count int64
	err := q.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM direct_messages dm
		JOIN direct_conversation_members cm ON cm.conversation_id = dm.conversation_id AND cm.user_id = $2
		WHERE dm.conversation_id = $1 AND dm.deleted_at IS NULL AND dm.created_at > cm.last_read_at AND (dm.user_id IS NULL OR dm.user_id <> $2)
	`, conversationID, userID).Scan(&count)
	return count, err
}

func (q *Queries) GetAttachmentDirectMessageID(ctx context.Context, attachmentID uuid.UUID) (uuid.NullUUID, error) {
	var messageID uuid.NullUUID
	err := q.db.QueryRow(ctx, `SELECT direct_message_id FROM attachments WHERE id = $1`, attachmentID).Scan(&messageID)
	return messageID, err
}

func (q *Queries) GetDirectMessageConversationID(ctx context.Context, messageID uuid.UUID) (uuid.UUID, error) {
	var conversationID uuid.UUID
	err := q.db.QueryRow(ctx, `SELECT conversation_id FROM direct_messages WHERE id = $1`, messageID).Scan(&conversationID)
	return conversationID, err
}
