-- +goose Up

CREATE TABLE starred_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES direct_conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((channel_id IS NOT NULL) <> (conversation_id IS NOT NULL))
);
CREATE UNIQUE INDEX ON starred_conversations (user_id, channel_id);
CREATE UNIQUE INDEX ON starred_conversations (user_id, conversation_id);

CREATE TABLE pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES direct_conversations(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((channel_id IS NOT NULL) <> (conversation_id IS NOT NULL))
);

-- +goose Down

DROP TABLE IF EXISTS pinned_messages;
DROP TABLE IF EXISTS starred_conversations;
