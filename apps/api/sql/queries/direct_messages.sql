-- name: CreateDirectConversation :one
INSERT INTO direct_conversations (created_by) VALUES ($1) RETURNING *;

-- name: AddDirectConversationMember :exec
INSERT INTO direct_conversation_members (conversation_id, user_id)
VALUES ($1, $2) ON CONFLICT DO NOTHING;

-- name: FindDirectConversation :one
SELECT dc.*
FROM direct_conversations dc
JOIN direct_conversation_members a ON a.conversation_id = dc.id AND a.user_id = $1
JOIN direct_conversation_members b ON b.conversation_id = dc.id AND b.user_id = $2
WHERE (SELECT COUNT(*) FROM direct_conversation_members m WHERE m.conversation_id = dc.id) = 2
LIMIT 1;

-- name: ListDirectConversationsForUser :many
SELECT dc.id, dc.created_by, dc.created_at,
       u.id AS other_user_id, u.display_name AS other_display_name, u.email AS other_email
FROM direct_conversations dc
JOIN direct_conversation_members mine ON mine.conversation_id = dc.id AND mine.user_id = $1
JOIN direct_conversation_members other ON other.conversation_id = dc.id AND other.user_id <> $1
JOIN users u ON u.id = other.user_id
ORDER BY dc.created_at DESC;

-- name: IsDirectConversationMember :one
SELECT EXISTS (
  SELECT 1 FROM direct_conversation_members
  WHERE conversation_id = $1 AND user_id = $2
);

-- name: CreateDirectMessage :one
INSERT INTO direct_messages (conversation_id, user_id, content)
VALUES ($1, $2, $3) RETURNING *;

-- name: ListDirectMessages :many
SELECT dm.*, u.display_name AS author_name
FROM direct_messages dm
LEFT JOIN users u ON u.id = dm.user_id
WHERE dm.conversation_id = $1 AND dm.deleted_at IS NULL
ORDER BY dm.created_at ASC;

-- name: ListUsersForDM :many
SELECT id, email, display_name, created_at, updated_at
FROM users WHERE id <> $1 ORDER BY display_name, email;
