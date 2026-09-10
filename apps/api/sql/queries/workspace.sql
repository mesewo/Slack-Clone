-- name: CreateWorkspace :one
INSERT INTO workspaces (name, slug)
VALUES ($1, $2)
RETURNING *;

-- name: GetWorkspaceBySlug :one
SELECT * FROM workspaces
WHERE slug = $1;

-- name: AddWorkspaceMember :exec
INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES ($1, $2, $3);

-- name: GetWorkspaceMember :one
SELECT * FROM workspace_members
WHERE workspace_id = $1 AND user_id = $2;

-- name: ListWorkspacesForUser :many
SELECT w.* FROM workspaces w
JOIN workspace_members wm ON wm.workspace_id = w.id
WHERE wm.user_id = $1
ORDER BY w.created_at;

-- name: AddUserToPublicWorkspaceChannels :exec
INSERT INTO channel_members (channel_id, user_id)
SELECT c.id, $2
FROM channels c
WHERE c.workspace_id = $1 AND c.type = 'PUBLIC'
ON CONFLICT (channel_id, user_id) DO NOTHING;

-- name: AddUserToPublicChannelsInWorkspace :exec
INSERT INTO channel_members (channel_id, user_id)
SELECT c.id, $2
FROM channels c
JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
WHERE wm.user_id = $2 AND c.workspace_id = $1 AND c.type = 'PUBLIC'
ON CONFLICT (channel_id, user_id) DO NOTHING;

-- name: ListWorkspaceMembers :many
SELECT wm.workspace_id, wm.user_id, wm.role, wm.joined_at,
	   u.email, u.display_name
FROM workspace_members wm
JOIN users u ON u.id = wm.user_id
WHERE wm.workspace_id = $1
ORDER BY CASE wm.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END,
		 u.display_name;

-- name: UpdateWorkspaceMemberRole :one
UPDATE workspace_members
SET role = $3
WHERE workspace_id = $1 AND user_id = $2
RETURNING *;

-- name: RemoveWorkspaceMember :exec
DELETE FROM workspace_members
WHERE workspace_id = $1 AND user_id = $2 AND role <> 'OWNER';