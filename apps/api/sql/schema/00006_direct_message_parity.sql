-- +goose Up
ALTER TABLE direct_messages ADD COLUMN parent_id UUID REFERENCES direct_messages(id) ON DELETE CASCADE;
ALTER TABLE direct_messages ADD COLUMN reply_count INT NOT NULL DEFAULT 0;
ALTER TABLE attachments ADD COLUMN direct_message_id UUID REFERENCES direct_messages(id) ON DELETE CASCADE;
CREATE INDEX idx_attachments_direct_message_id ON attachments(direct_message_id);

CREATE TABLE direct_message_reactions (
    message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS direct_message_reactions;
DROP INDEX IF EXISTS idx_attachments_direct_message_id;
ALTER TABLE attachments DROP COLUMN IF EXISTS direct_message_id;
ALTER TABLE direct_messages DROP COLUMN IF EXISTS reply_count;
ALTER TABLE direct_messages DROP COLUMN IF EXISTS parent_id;