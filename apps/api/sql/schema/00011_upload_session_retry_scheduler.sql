-- +goose Up
-- +goose StatementBegin
ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_next_attempt_at
    ON upload_sessions(next_attempt_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_upload_sessions_next_attempt_at;
ALTER TABLE upload_sessions
    DROP COLUMN IF EXISTS next_attempt_at;
-- +goose StatementEnd
