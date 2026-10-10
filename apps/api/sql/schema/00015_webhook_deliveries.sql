-- +goose Up
CREATE TABLE webhook_deliveries (
    event_id TEXT NOT NULL,
    webhook_id UUID NOT NULL REFERENCES workspace_webhooks(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, webhook_id)
);

-- +goose Down
DROP TABLE IF EXISTS webhook_deliveries;
