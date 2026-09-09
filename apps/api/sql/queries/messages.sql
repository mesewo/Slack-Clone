-- name: CreateMessage :one
INSERT INTO messages (channel_id, user_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpdateMessageContent :one
UPDATE messages
SET content = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateThreadReply :one
INSERT INTO messages (channel_id, user_id, content, parent_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: IncrementReplyCount :exec
UPDATE messages
SET reply_count = reply_count + 1
WHERE id = $1;

-- name: GetMessageByID :one
SELECT * FROM messages
WHERE id = $1;

-- name: ListThreadReplies :many
SELECT m.*, u.display_name AS author_name
FROM messages m
LEFT JOIN users u ON u.id = m.user_id
WHERE m.parent_id = $1
  AND m.deleted_at IS NULL
ORDER BY m.created_at ASC;

-- name: ListChannelMessages :many
-- Cursor pagination: pass the created_at of the oldest message you already have
-- to get the next (older) page. For the first page, pass now() as the cursor.
SELECT * FROM messages
WHERE channel_id = $1
  AND created_at < $2
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $3;

-- name: ListChannelMessagesWithAuthor :many
-- Same pagination as above, but joins the sender's display_name in one
-- query instead of looking it up per-message. LEFT JOIN so a message from
-- a deleted user (user_id set NULL) still returns instead of disappearing.
SELECT m.*, u.display_name AS author_name
FROM messages m
LEFT JOIN users u ON u.id = m.user_id
WHERE m.channel_id = $1
  AND m.created_at < $2
  AND m.deleted_at IS NULL
ORDER BY m.created_at DESC
LIMIT $3;

-- name: ListMessagesForSearch :many
SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at, m.updated_at, m.deleted_at, m.parent_id, m.reply_count,
       u.display_name AS author_name
FROM messages m
LEFT JOIN users u ON u.id = m.user_id
WHERE m.deleted_at IS NULL
ORDER BY m.created_at DESC;

-- name: UpsertMessageReaction :exec
INSERT INTO message_reactions (message_id, user_id, emoji)
VALUES ($1, $2, $3)
ON CONFLICT (message_id, user_id)
DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();

-- name: RemoveMessageReaction :exec
DELETE FROM message_reactions
WHERE message_id = $1 AND user_id = $2;

-- name: GetMessageReaction :one
SELECT message_id, user_id, emoji, created_at
FROM message_reactions
WHERE message_id = $1 AND user_id = $2;

-- name: ListMessageReactions :many
SELECT message_id, user_id, emoji, created_at
FROM message_reactions
WHERE message_id = $1
ORDER BY created_at;

-- name: DeleteMessage :exec
UPDATE messages
SET deleted_at = now()
WHERE id = $1;

-- name: CreateAttachment :one
INSERT INTO attachments (id, user_id, filename, content_type, size_bytes, storage_path, thumbnail_path)
VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''))
RETURNING *;

-- name: GetAttachmentByID :one
SELECT * FROM attachments WHERE id = $1;

-- name: AttachFilesToMessage :exec
UPDATE attachments a
SET message_id = $1
FROM messages m
WHERE a.id = ANY($2::uuid[])
  AND a.user_id = $3
  AND m.id = $1
  AND m.channel_id = $4;

-- name: ListAttachmentsForMessage :many
SELECT * FROM attachments
WHERE message_id = $1
ORDER BY created_at;