ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS sent_message_ids JSONB DEFAULT '{}';
