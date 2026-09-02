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