-- =============================================================================
-- fix_duplicate_users.sql
-- One-time script to detect and resolve duplicate user records that share the
-- same telegram_id.  Run this ONLY ONCE in a maintenance window after taking a
-- full database backup.
--
-- Strategy
-- --------
-- 1. Identify all telegram_ids that have more than one user record.
-- 2. For each duplicate group, designate the OLDEST record (smallest created_at)
--    as the "canonical" (primary) record – this is the record miniApp already
--    reads via ORDER BY created_at ASC LIMIT 1.
-- 3. Merge balances from the duplicate(s) into the canonical record.
-- 4. Re-parent foreign-key references (deposit_records, withdrawal_records,
--    transfer_records, trading_orders, red_packet_claims, etc.) from duplicates
--    to the canonical record.
-- 5. Delete the duplicate records.
--
-- ⚠️  IMPORTANT: Take a backup first!
--     pg_dump -U <user> <dbname> > backup_before_dedup_$(date +%Y%m%d).sql
--
-- ⚠️  Review the preview queries at the top before uncommenting the
--     modification statements.
-- =============================================================================

-- ─── Step 0: Preview duplicates ─────────────────────────────────────────────

SELECT
  telegram_id,
  COUNT(*) AS record_count,
  MIN(created_at) AS canonical_created_at,
  SUM(COALESCE(wallet_balance, 0)) AS total_wallet_balance,
  SUM(COALESCE(red_packet_credits, 0)) AS total_red_packet_credits,
  SUM(COALESCE(reward_balance, 0)) AS total_reward_balance
FROM users
GROUP BY telegram_id
HAVING COUNT(*) > 1
ORDER BY record_count DESC;

-- If the query above returns 0 rows, there are no duplicates and you can stop.


-- ─── Step 1: Merge balances into canonical record ───────────────────────────
-- Uncomment the block below to apply the fix.

/*
BEGIN;

-- Merge all balances from duplicate records into the canonical record.
UPDATE users AS canonical
SET
  wallet_balance     = canonical.wallet_balance
                       + COALESCE(dups.extra_wallet, 0),
  red_packet_credits = COALESCE(canonical.red_packet_credits, 0)
                       + COALESCE(dups.extra_red_packet, 0),
  reward_balance     = COALESCE(canonical.reward_balance, 0)
                       + COALESCE(dups.extra_reward, 0),
  total_recharged    = COALESCE(canonical.total_recharged, 0)
                       + COALESCE(dups.extra_recharged, 0),
  total_withdrawn    = COALESCE(canonical.total_withdrawn, 0)
                       + COALESCE(dups.extra_withdrawn, 0)
FROM (
  SELECT
    -- canonical id per telegram_id (oldest created_at)
    FIRST_VALUE(id) OVER w AS canonical_id,
    id                      AS dup_id,
    SUM(COALESCE(wallet_balance, 0))     FILTER (WHERE id <> FIRST_VALUE(id) OVER w) OVER w AS extra_wallet,
    SUM(COALESCE(red_packet_credits, 0)) FILTER (WHERE id <> FIRST_VALUE(id) OVER w) OVER w AS extra_red_packet,
    SUM(COALESCE(reward_balance, 0))     FILTER (WHERE id <> FIRST_VALUE(id) OVER w) OVER w AS extra_reward,
    SUM(COALESCE(total_recharged, 0))    FILTER (WHERE id <> FIRST_VALUE(id) OVER w) OVER w AS extra_recharged,
    SUM(COALESCE(total_withdrawn, 0))    FILTER (WHERE id <> FIRST_VALUE(id) OVER w) OVER w AS extra_withdrawn,
    ROW_NUMBER() OVER w                 AS rn
  FROM users
  WHERE telegram_id IN (
    SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
  )
  WINDOW w AS (PARTITION BY telegram_id ORDER BY created_at ASC)
) AS dups
WHERE canonical.id = dups.canonical_id
  AND dups.rn = 1;  -- only update the canonical row once


-- ─── Step 2: Re-parent foreign keys ─────────────────────────────────────────

-- deposit_records
UPDATE deposit_records dr
SET user_id = canon.canonical_id
FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS canonical_id
  FROM users
  WHERE telegram_id IN (
    SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
  )
) AS canon
WHERE dr.user_id = canon.dup_id
  AND canon.dup_id <> canon.canonical_id;

-- withdrawal_records
UPDATE withdrawal_records wr
SET user_id = canon.canonical_id
FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS canonical_id
  FROM users
  WHERE telegram_id IN (
    SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
  )
) AS canon
WHERE wr.user_id = canon.dup_id
  AND canon.dup_id <> canon.canonical_id;

-- transfer_records (from side)
UPDATE transfer_records tr
SET from_user_id = canon.canonical_id
FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS canonical_id
  FROM users
  WHERE telegram_id IN (
    SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
  )
) AS canon
WHERE tr.from_user_id = canon.dup_id
  AND canon.dup_id <> canon.canonical_id;

-- transfer_records (to side)
UPDATE transfer_records tr
SET to_user_id = canon.canonical_id
FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS canonical_id
  FROM users
  WHERE telegram_id IN (
    SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
  )
) AS canon
WHERE tr.to_user_id = canon.dup_id
  AND canon.dup_id <> canon.canonical_id;

-- trading_orders (if trading feature is enabled)
UPDATE trading_orders tord
SET user_id = canon.canonical_id
FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS canonical_id
  FROM users
  WHERE telegram_id IN (
    SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
  )
) AS canon
WHERE tord.user_id = canon.dup_id
  AND canon.dup_id <> canon.canonical_id;

-- red_packet_claims
UPDATE red_packet_claims rpc
SET user_id = canon.canonical_id
FROM (
  SELECT id AS dup_id,
         FIRST_VALUE(id) OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS canonical_id
  FROM users
  WHERE telegram_id IN (
    SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
  )
) AS canon
WHERE rpc.user_id = canon.dup_id
  AND canon.dup_id <> canon.canonical_id;


-- ─── Step 3: Delete duplicate records ───────────────────────────────────────

DELETE FROM users
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS rn
    FROM users
    WHERE telegram_id IN (
      SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1
    )
  ) ranked
  WHERE rn > 1
);


-- ─── Step 4: Add unique constraint to prevent future duplicates ──────────────
-- Only run if the constraint does not already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_telegram_id_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_telegram_id_unique UNIQUE (telegram_id);
  END IF;
END $$;


COMMIT;
*/

-- After running, verify no duplicates remain:
-- SELECT telegram_id, COUNT(*) FROM users GROUP BY telegram_id HAVING COUNT(*) > 1;
