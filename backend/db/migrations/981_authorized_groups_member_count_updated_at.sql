-- Track when Telegram member count was last refreshed for each authorized group
ALTER TABLE authorized_groups
  ADD COLUMN IF NOT EXISTS member_count_updated_at TIMESTAMPTZ;
