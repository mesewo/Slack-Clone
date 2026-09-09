-- +goose Up

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS presence_status text NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS saved_messages (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  attachment_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((channel_id IS NOT NULL) <> (conversation_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx
  ON scheduled_messages (scheduled_for) WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS thread_subscriptions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mentions boolean NOT NULL DEFAULT true,
  direct_messages boolean NOT NULL DEFAULT true,
  thread_replies boolean NOT NULL DEFAULT true,
  reactions boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down

DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS thread_subscriptions;
DROP TABLE IF EXISTS scheduled_messages;
DROP TABLE IF EXISTS saved_messages;
ALTER TABLE users
  DROP COLUMN IF EXISTS presence_status,
  DROP COLUMN IF EXISTS avatar_url;
