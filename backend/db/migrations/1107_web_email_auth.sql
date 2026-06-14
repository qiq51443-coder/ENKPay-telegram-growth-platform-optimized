ALTER TABLE users
  ALTER COLUMN telegram_id DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS register_type VARCHAR(20) DEFAULT 'telegram';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(email)
  WHERE email IS NOT NULL;

UPDATE users
   SET register_type = COALESCE(NULLIF(register_type, ''), 'telegram')
 WHERE register_type IS NULL OR register_type = '';

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'register',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_lookup
  ON email_verification_codes(email, purpose, created_at DESC);
