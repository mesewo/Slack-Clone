-- name: CreateWorkspaceWebhook :one
INSERT INTO workspace_webhooks (workspace_id, url, secret)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListWorkspaceWebhooks :many
SELECT * FROM workspace_webhooks
WHERE workspace_id = $1
ORDER BY created_at, id;

-- name: UpdateWorkspaceWebhook :one
UPDATE workspace_webhooks
SET url = $3, secret = $4, updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: DeleteWorkspaceWebhook :execrows
DELETE FROM workspace_webhooks
WHERE workspace_id = $1 AND id = $2;

-- name: GetChannelWorkspaceID :one
SELECT workspace_id FROM channels WHERE id = $1;
