package database

import (
	"context"
	"fmt"
	"strings"
	"time"

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

func (q *Queries) GetAttachmentByStoragePath(ctx context.Context, userID uuid.UUID, storagePath string) (Attachment, error) {
	var item Attachment
	err := q.db.QueryRow(ctx, `
		SELECT id, message_id, user_id, filename, content_type, size_bytes, storage_path, thumbnail_path, created_at, direct_message_id
		FROM attachments WHERE user_id = $1 AND storage_path = $2 LIMIT 1
	`, userID, storagePath).Scan(
		&item.ID, &item.MessageID, &item.UserID, &item.Filename, &item.ContentType,
		&item.SizeBytes, &item.StoragePath, &item.ThumbnailPath, &item.CreatedAt, &item.DirectMessageID,
	)
	return item, err
}

func (q *Queries) CreateUploadSession(ctx context.Context, arg UploadSession) (UploadSession, error) {
	var item UploadSession
	err := q.db.QueryRow(ctx, `
		INSERT INTO upload_sessions (
			id, user_id, workspace_id, channel_id, direct_conversation_id,
			object_key, original_filename, content_type, declared_size, status,
			attempt_count, expires_at, created_at, confirmed_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		)
		RETURNING id, user_id, workspace_id, channel_id, direct_conversation_id,
			object_key, original_filename, content_type, declared_size,
			status, attempt_count, expires_at, created_at, confirmed_at, updated_at
	`,
		arg.ID, arg.UserID, arg.WorkspaceID, arg.ChannelID, arg.DirectConversationID,
		arg.ObjectKey, arg.OriginalFilename, arg.ContentType, arg.DeclaredSize,
		arg.Status, arg.AttemptCount, arg.ExpiresAt, arg.CreatedAt, arg.ConfirmedAt, arg.UpdatedAt,
	).Scan(
		&item.ID, &item.UserID, &item.WorkspaceID, &item.ChannelID, &item.DirectConversationID,
		&item.ObjectKey, &item.OriginalFilename, &item.ContentType, &item.DeclaredSize,
		&item.Status, &item.AttemptCount, &item.ExpiresAt, &item.CreatedAt, &item.ConfirmedAt, &item.UpdatedAt,
	)
	return item, err
}

func (q *Queries) GetUploadSessionByID(ctx context.Context, id uuid.UUID) (UploadSession, error) {
	var item UploadSession
	err := q.db.QueryRow(ctx, `
		SELECT id, user_id, workspace_id, channel_id, direct_conversation_id,
			object_key, original_filename, content_type, declared_size,
			status, attempt_count, expires_at, created_at, confirmed_at, updated_at
		FROM upload_sessions WHERE id = $1
	`, id).Scan(
		&item.ID, &item.UserID, &item.WorkspaceID, &item.ChannelID, &item.DirectConversationID,
		&item.ObjectKey, &item.OriginalFilename, &item.ContentType, &item.DeclaredSize,
		&item.Status, &item.AttemptCount, &item.ExpiresAt, &item.CreatedAt, &item.ConfirmedAt, &item.UpdatedAt,
	)
	return item, err
}

func (q *Queries) UpdateUploadSessionStatus(ctx context.Context, id uuid.UUID, status string, confirmedAt *time.Time, attemptCount int32) error {
	_, err := q.db.Exec(ctx, `
		UPDATE upload_sessions
		SET status = $2, confirmed_at = COALESCE($3, confirmed_at), attempt_count = $4, updated_at = NOW()
		WHERE id = $1
	`, id, status, confirmedAt, attemptCount)
	return err
}

func (q *Queries) UpdateAttachmentThumbnailByStoragePath(ctx context.Context, storagePath string, userID uuid.UUID, thumbnailPath string) error {
	_, err := q.db.Exec(ctx, `
		UPDATE attachments
		SET thumbnail_path = NULLIF($3, ''), updated_at = NOW()
		WHERE storage_path = $1 AND user_id = $2
	`, storagePath, userID, thumbnailPath)
	return err
}

func (q *Queries) RequeueUploadSessions(ctx context.Context, statuses []string, staleBefore time.Time) ([]UploadSession, error) {
	if len(statuses) == 0 {
		return nil, nil
	}
	args := []interface{}{staleBefore}
	placeholders := make([]string, 0, len(statuses))
	for _, status := range statuses {
		placeholders = append(placeholders, fmt.Sprintf("$%d", len(args)+1))
		args = append(args, status)
	}
	query := `
		SELECT id, user_id, workspace_id, channel_id, direct_conversation_id,
			object_key, original_filename, content_type, declared_size,
			status, attempt_count, expires_at, created_at, confirmed_at, updated_at
		FROM upload_sessions
		WHERE updated_at <= $1 AND status IN (` + strings.Join(placeholders, ",") + `)
		ORDER BY created_at ASC
	`
	rows, err := q.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]UploadSession, 0)
	for rows.Next() {
		var item UploadSession
		if err := rows.Scan(
			&item.ID, &item.UserID, &item.WorkspaceID, &item.ChannelID, &item.DirectConversationID,
			&item.ObjectKey, &item.OriginalFilename, &item.ContentType, &item.DeclaredSize,
			&item.Status, &item.AttemptCount, &item.ExpiresAt, &item.CreatedAt, &item.ConfirmedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) CleanupExpiredUploadSessions(ctx context.Context, cutoff time.Time) (int64, error) {
	result, err := q.db.Exec(ctx, `
		DELETE FROM upload_sessions
		WHERE expires_at < $1 AND status NOT IN ('READY', 'FAILED', 'EXPIRED')
	`, cutoff)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}
