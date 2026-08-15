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