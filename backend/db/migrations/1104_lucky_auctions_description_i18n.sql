-- Add multilingual description support for lucky auctions
ALTER TABLE lucky_auctions
  ADD COLUMN IF NOT EXISTS description_i18n JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_lucky_auctions_description_i18n
  ON lucky_auctions USING GIN (description_i18n);
