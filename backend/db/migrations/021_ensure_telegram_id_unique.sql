-- Migration 021: Ensure telegram_id UNIQUE constraint exists (idempotent)
-- Safe to re-run even if migration 020 already succeeded.
-- Migration 020 runs inside a transaction and silently fails if duplicate
-- telegram_id rows exist, leaving the table without the UNIQUE constraint.
-- This migration detects that case and repairs it atomically.

DO $$
BEGIN
  -- Only proceed if constraint does not already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_telegram_id_key'
      AND conrelid = 'users'::regclass
  ) THEN
    -- Merge wallet_balance from duplicates into canonical before deleting
    WITH ranked AS (
      SELECT id, telegram_id,
             ROW_NUMBER() OVER (PARTITION BY telegram_id ORDER BY created_at ASC) AS rn
      FROM users
      WHERE telegram_id IS NOT NULL
    ),
    canonical AS (
      SELECT telegram_id, id AS canon_id FROM ranked WHERE rn = 1
    )
    UPDATE users u
    SET wallet_balance = sq.total_bal
    FROM (
      SELECT c.canon_id, COALESCE(SUM(COALESCE(u2.wallet_balance, 0)), 0) AS total_bal
      FROM canonical c
      JOIN users u2 ON u2.telegram_id = c.telegram_id
      GROUP BY c.canon_id
    ) sq
    WHERE u.id = sq.canon_id;

    -- Re-parent FK references from duplicate rows to canonical rows
    DO $inner$
    BEGIN
      UPDATE deposit_records dr
      SET user_id = c.canon_id
      FROM (
        SELECT DISTINCT ON (telegram_id) id AS canon_id, telegram_id
        FROM users ORDER BY telegram_id, created_at ASC
      ) c
      JOIN users dup ON dup.telegram_id = c.telegram_id AND dup.id <> c.canon_id
      WHERE dr.user_id = dup.id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $inner$;

    DO $inner$
    BEGIN
      UPDATE withdrawal_records wr
      SET user_id = c.canon_id
      FROM (
        SELECT DISTINCT ON (telegram_id) id AS canon_id, telegram_id
        FROM users ORDER BY telegram_id, created_at ASC
      ) c
      JOIN users dup ON dup.telegram_id = c.telegram_id AND dup.id <> c.canon_id
      WHERE wr.user_id = dup.id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $inner$;

    DO $inner$
    BEGIN
      UPDATE transfer_records tr
      SET from_user_id = c.canon_id
      FROM (
        SELECT DISTINCT ON (telegram_id) id AS canon_id, telegram_id
        FROM users ORDER BY telegram_id, created_at ASC
      ) c
      JOIN users dup ON dup.telegram_id = c.telegram_id AND dup.id <> c.canon_id
      WHERE tr.from_user_id = dup.id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $inner$;

    DO $inner$
    BEGIN
      UPDATE transfer_records tr
      SET to_user_id = c.canon_id
      FROM (
        SELECT DISTINCT ON (telegram_id) id AS canon_id, telegram_id
        FROM users ORDER BY telegram_id, created_at ASC
      ) c
      JOIN users dup ON dup.telegram_id = c.telegram_id AND dup.id <> c.canon_id
      WHERE tr.to_user_id = dup.id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $inner$;

    -- Delete duplicate rows (keep only oldest per telegram_id)
    DELETE FROM users
    WHERE id NOT IN (
      SELECT DISTINCT ON (telegram_id) id
      FROM users
      WHERE telegram_id IS NOT NULL
      ORDER BY telegram_id, created_at ASC
    )
    AND telegram_id IS NOT NULL;

    -- Now add the unique constraint
    ALTER TABLE users ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);

    RAISE NOTICE 'Migration 021: Added users_telegram_id_key UNIQUE constraint';
  ELSE
    RAISE NOTICE 'Migration 021: users_telegram_id_key already exists — skipping';
  END IF;
END $$;
