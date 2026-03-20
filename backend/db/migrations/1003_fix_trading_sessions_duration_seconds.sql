-- Fix trading_sessions duration_seconds NOT NULL constraint
ALTER TABLE trading_sessions 
  ALTER COLUMN duration_seconds SET DEFAULT 60;

-- Backfill existing NULL values
UPDATE trading_sessions 
  SET duration_seconds = COALESCE(
    (SELECT tr.duration_seconds FROM trading_rules tr WHERE tr.id = trading_sessions.rule_id),
    60
  )
  WHERE duration_seconds IS NULL;

-- Also fix trading_rules if needed
ALTER TABLE trading_rules 
  ALTER COLUMN duration_seconds SET DEFAULT 60;

UPDATE trading_rules 
  SET duration_seconds = 60
  WHERE duration_seconds IS NULL;
