-- name: CreateChannel :one
INSERT INTO channels (workspace_id, name, type, created_by)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: AddChannelMember :exec
INSERT INTO channel_members (channel_id, user_id)
VALUES ($1, $2);

-- name: ListChannelsForUser :many
SELECT c.* FROM channels c
JOIN channel_members cm ON cm.channel_id = c.id
WHERE cm.user_id = $1 AND c.workspace_id = $2
ORDER BY c.name;

-- name: ListWorkspaceChannelsForUser :many
-- Used on WebSocket connect to subscribe the user to every channel they're
-- in, across all workspaces - not filtered to one workspace like
-- ListChannelsForUser above.
SELECT c.id, c.workspace_id
FROM channels c
JOIN channel_members cm ON cm.channel_id = c.id
WHERE cm.user_id = $1;

-- name: IsChannelMember :one
SELECT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = $1 AND user_id = $2
);

-- name: UpdateLastRead :exec
UPDATE channel_members
SET last_read_at = now()
WHERE channel_id = $1 AND user_id = $2;