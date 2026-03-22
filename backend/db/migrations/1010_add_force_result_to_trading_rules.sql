-- Migration: Add force_result column to trading_rules
-- This field allows admins to explicitly override the settlement direction for a rule.
-- When force_result = true AND direction IS NOT NULL, auto-settle will use rule.direction
-- instead of the natural price-based result.
-- DEFAULT false ensures existing rules are NOT affected (safe migration).

ALTER TABLE trading_rules
  ADD COLUMN IF NOT EXISTS force_result BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN trading_rules.force_result IS
  'When true, overrides price-based settlement with rule.direction. Use with caution.';
