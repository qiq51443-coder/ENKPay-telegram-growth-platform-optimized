-- Migration: broadcast_messages table
-- Records the Telegram message_id for each user a broadcast was sent to,
-- enabling message recall (deleteMessage) when a broadcast is deleted.

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  UUID    NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  telegram_id   BIGINT  NOT NULL,
  message_id    BIGINT  NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id ON broadcast_messages(broadcast_id);
