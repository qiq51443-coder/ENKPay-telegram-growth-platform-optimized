-- ============================================================
-- scripts/migrate-009-fix-trading-types.sql
--
-- Convenience script for Render / manual DB console execution.
-- Paste the entire contents into the Render database shell to
-- fix UUID→INTEGER type mismatches that prevent instant trading
-- from working correctly.
--
-- This is identical to backend/db/migrations/1005_fix_schema_type_mismatches.sql
-- and is safe to run multiple times (idempotent).
-- ============================================================

-- ─── Fix price_points.pair_id (UUID → INTEGER) ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_points'
      AND column_name = 'pair_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE price_points DROP CONSTRAINT IF EXISTS price_points_pair_id_fkey;
    ALTER TABLE price_points ALTER COLUMN pair_id DROP NOT NULL;
    ALTER TABLE price_points ALTER COLUMN pair_id TYPE INTEGER USING NULL;
    BEGIN
      ALTER TABLE price_points ADD CONSTRAINT price_points_pair_id_fkey
        FOREIGN KEY (pair_id) REFERENCES trading_pairs(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- Ensure price_points has INTEGER pair_id (create column if missing)
ALTER TABLE price_points ADD COLUMN IF NOT EXISTS pair_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'price_points'
      AND ccu.column_name = 'pair_id'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    BEGIN
      ALTER TABLE price_points ADD CONSTRAINT price_points_pair_id_fkey
        FOREIGN KEY (pair_id) REFERENCES trading_pairs(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_price_points_pair_timestamp;
CREATE INDEX IF NOT EXISTS idx_price_points_pair_timestamp ON price_points(pair_id, timestamp DESC);

-- ─── Fix trading_rules.pair_id (UUID → INTEGER) ─────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_rules'
      AND column_name = 'pair_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE trading_rules DROP CONSTRAINT IF EXISTS trading_rules_pair_id_fkey;
    -- UUID values cannot be cast to INTEGER and any UUID value stored here came
    -- from a buggy migration (901) that used the wrong type.  The application
    -- has always written INTEGER pair_id values, so existing UUID values are
    -- already invalid foreign-key references that cannot be preserved.
    -- Intentionally NULL them out before changing the column type.
    UPDATE trading_rules SET pair_id = NULL;
    ALTER TABLE trading_rules ALTER COLUMN pair_id TYPE INTEGER USING NULL;
    BEGIN
      ALTER TABLE trading_rules ADD CONSTRAINT trading_rules_pair_id_fkey
        FOREIGN KEY (pair_id) REFERENCES trading_pairs(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ─── Fix trading_sessions.rule_id (UUID → INTEGER) ──────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_sessions'
      AND column_name = 'rule_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE trading_sessions DROP CONSTRAINT IF EXISTS trading_sessions_rule_id_fkey;
    -- Same rationale as trading_rules.pair_id above: the UUID values here were
    -- written by migration 901 with the wrong type and are already invalid.
    -- The column is nullable (ON DELETE SET NULL) so NULLing out bad values
    -- is the correct repair — sessions remain valid, just without a rule link.
    UPDATE trading_sessions SET rule_id = NULL;
    ALTER TABLE trading_sessions ALTER COLUMN rule_id TYPE INTEGER USING NULL;
    BEGIN
      ALTER TABLE trading_sessions ADD CONSTRAINT trading_sessions_rule_id_fkey
        FOREIGN KEY (rule_id) REFERENCES trading_rules(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ─── Ensure open_price allows NULL (quick-session flow) ─────────────────────
ALTER TABLE trading_sessions ALTER COLUMN open_price DROP NOT NULL;

-- ─── Ensure duration_seconds has a default ──────────────────────────────────
ALTER TABLE trading_sessions ALTER COLUMN duration_seconds SET DEFAULT 60;
UPDATE trading_sessions SET duration_seconds = 60 WHERE duration_seconds IS NULL;
ALTER TABLE trading_rules ALTER COLUMN duration_seconds SET DEFAULT 60;
UPDATE trading_rules SET duration_seconds = 60 WHERE duration_seconds IS NULL;
