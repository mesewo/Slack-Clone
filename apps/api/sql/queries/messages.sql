-- name: CreateMessage :one
INSERT INTO messages (channel_id, user_id, content)
VALUES ($1, $2, $3)
RETURNING *;

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