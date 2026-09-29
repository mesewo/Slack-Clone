package database

import (
	"context"

	"github.com/google/uuid"
)

func (q *Queries) FindSelfDirectConversation(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	var conversationID uuid.UUID
	err := q.db.QueryRow(ctx, `
		SELECT dc.id
		FROM direct_conversations dc
		JOIN direct_conversation_members member ON member.conversation_id = dc.id
		WHERE dc.created_by = $1 AND member.user_id = $1
		GROUP BY dc.id
		HAVING COUNT(*) = 1
		ORDER BY dc.created_at
		LIMIT 1`, userID).Scan(&conversationID)
	return conversationID, err
}

func (q *Queries) CreateSelfDirectConversation(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	conversationID, err := q.FindSelfDirectConversation(ctx, userID)
	if err == nil {
		return conversationID, nil
	}
	conversation, err := q.CreateDirectConversation(ctx, userID)
	if err != nil {
		return uuid.Nil, err
	}
	if err := q.AddDirectConversationMember(ctx, AddDirectConversationMemberParams{ConversationID: conversation.ID, UserID: userID}); err != nil {
		return uuid.Nil, err
	}
	return conversation.ID, nil
}

func (q *Queries) AttachFilesToDirectMessage(ctx context.Context, messageID uuid.UUID, attachmentIDs []uuid.UUID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE attachments SET direct_message_id = $1 WHERE id = ANY($2::uuid[]) AND user_id = $3 AND message_id IS NULL`, messageID, attachmentIDs, userID)
	return err
}

func (q *Queries) ListAttachmentsForDirectMessage(ctx context.Context, messageID uuid.UUID) ([]Attachment, error) {
	rows, err := q.db.Query(ctx, `SELECT id, direct_message_id, user_id, filename, content_type, size_bytes, storage_path, thumbnail_path, created_at FROM attachments WHERE direct_message_id = $1 ORDER BY created_at`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Attachment, 0)
	for rows.Next() {
		var item Attachment
		if err := rows.Scan(&item.ID, &item.MessageID, &item.UserID, &item.Filename, &item.ContentType, &item.SizeBytes, &item.StoragePath, &item.ThumbnailPath, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type DirectReactionRow struct {
	MessageID uuid.UUID `json:"message_id"`
	UserID    uuid.UUID `json:"user_id"`
	Emoji     string    `json:"emoji"`
}

func (q *Queries) ListDirectMessageReactions(ctx context.Context, messageID uuid.UUID) ([]DirectReactionRow, error) {
	rows, err := q.db.Query(ctx, `SELECT message_id, user_id, emoji FROM direct_message_reactions WHERE message_id = $1`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]DirectReactionRow, 0)
	for rows.Next() {
		var item DirectReactionRow
		if err := rows.Scan(&item.MessageID, &item.UserID, &item.Emoji); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) UpsertDirectMessageReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	_, err := q.db.Exec(ctx, `INSERT INTO direct_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji`, messageID, userID, emoji)
	return err
}

func (q *Queries) RemoveDirectMessageReaction(ctx context.Context, messageID, userID uuid.UUID) error {
	_, err := q.db.Exec(ctx, `DELETE FROM direct_message_reactions WHERE message_id = $1 AND user_id = $2`, messageID, userID)
	return err
}

func (q *Queries) CreateDirectThreadReply(ctx context.Context, conversationID, userID, parentID uuid.UUID, content string) (DirectMessage, error) {
	var item DirectMessage
	err := q.db.QueryRow(ctx, `INSERT INTO direct_messages (conversation_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING id, conversation_id, user_id, content, created_at, updated_at, deleted_at`, conversationID, userID, content, parentID).Scan(&item.ID, &item.ConversationID, &item.UserID, &item.Content, &item.CreatedAt, &item.UpdatedAt, &item.DeletedAt)
	if err != nil {
		return item, err
	}
	_, err = q.db.Exec(ctx, `UPDATE direct_messages SET reply_count = reply_count + 1 WHERE id = $1`, parentID)
	return item, err
}

func (q *Queries) SearchDirectMessages(ctx context.Context, conversationID uuid.UUID, query string) ([]DirectMessage, error) {
	rows, err := q.db.Query(ctx, `SELECT id, conversation_id, user_id, content, created_at, updated_at, deleted_at, parent_id, reply_count FROM direct_messages WHERE conversation_id = $1 AND deleted_at IS NULL AND content ILIKE '%' || $2 || '%' ORDER BY created_at DESC LIMIT 50`, conversationID, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]DirectMessage, 0)
	for rows.Next() {
		var item DirectMessage
		if err := rows.Scan(&item.ID, &item.ConversationID, &item.UserID, &item.Content, &item.CreatedAt, &item.UpdatedAt, &item.DeletedAt, &item.ParentID, &item.ReplyCount); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) GetDirectMessageByID(ctx context.Context, id uuid.UUID) (DirectMessage, error) {
	var item DirectMessage
	err := q.db.QueryRow(ctx, `SELECT id, conversation_id, user_id, content, created_at, updated_at, deleted_at, parent_id, reply_count FROM direct_messages WHERE id = $1 AND deleted_at IS NULL`, id).
		Scan(&item.ID, &item.ConversationID, &item.UserID, &item.Content, &item.CreatedAt, &item.UpdatedAt, &item.DeletedAt, &item.ParentID, &item.ReplyCount)
	return item, err
}

func (q *Queries) DeleteDirectMessage(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, `UPDATE direct_messages SET deleted_at = now() WHERE id = $1`, id)
	return err
}

func (q *Queries) UpdateDirectMessage(ctx context.Context, id uuid.UUID, content string) error {
	_, err := q.db.Exec(ctx, `UPDATE direct_messages SET content = $2, updated_at = now() WHERE id = $1`, id, content)
	return err
}