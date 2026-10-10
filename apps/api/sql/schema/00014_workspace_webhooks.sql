-- +goose Up
CREATE TABLE workspace_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, url)
);

CREATE INDEX workspace_webhooks_workspace_idx ON workspace_webhooks (workspace_id);

-- +goose Down
DROP TABLE IF EXISTS workspace_webhooks;
