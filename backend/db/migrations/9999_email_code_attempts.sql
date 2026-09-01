-- 为验证码表增加 attempts 字段（错误次数限制）
-- 若表已有该字段可忽略报错

ALTER TABLE email_verification_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- 可选：为常用查询加索引
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email_purpose_created
  ON email_verification_codes (email, purpose, created_at DESC);
