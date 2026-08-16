-- +goose Up
-- +goose StatementBegin
-- CASCADE here is a safety net for a hypothetical future hard-delete path.
-- Day-to-day, messages are soft-deleted (deleted_at), so the parent row
-- stays in place and replies never actually orphan.
ALTER TABLE messages ADD COLUMN parent_id UUID REFERENCES messages(id) ON DELETE CASCADE;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE messages ADD COLUMN reply_count INT NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX idx_messages_parent_id ON messages(parent_id) WHERE parent_id IS NOT NULL;
-- +goose StatementEnd

-- +goose StatementBegin
-- PRIMARY KEY (message_id, user_id) - not (message_id, user_id, emoji) -
-- is what enforces "one reaction per user per message." Adding a second
-- reaction for the same user+message is an UPDATE (change the emoji),
-- not an INSERT.
CREATE TABLE message_reactions (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS message_reactions;
-- +goose StatementEnd

-- +goose StatementBegin
DROP INDEX IF EXISTS idx_messages_parent_id;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE messages DROP COLUMN IF EXISTS reply_count;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE messages DROP COLUMN IF EXISTS parent_id;
-- +goose StatementEnd