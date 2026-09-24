-- +goose Up
ALTER TABLE event_outbox
    ADD COLUMN claimed_at TIMESTAMPTZ,
    ADD COLUMN claim_token UUID,
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_event_outbox_claimable
    ON event_outbox (created_at)
    WHERE published_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_event_outbox_claimable;
ALTER TABLE event_outbox
    DROP COLUMN IF EXISTS attempts,
    DROP COLUMN IF EXISTS claim_token,
    DROP COLUMN IF EXISTS claimed_at;
