-- Migration 961: Backfill unique_id for canonical user rows where it is NULL
-- Users who registered before migration 902 (which added the unique_id column)
-- may have unique_id = NULL on their canonical (earliest-created) row.

DO $$
DECLARE
  r RECORD;
  new_id TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i INT;
  attempts INT;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (telegram_id) id, telegram_id
    FROM users
    WHERE unique_id IS NULL
    ORDER BY telegram_id, created_at ASC
  LOOP
    attempts := 0;
    LOOP
      new_id := '';
      FOR i IN 1..7 LOOP
        new_id := new_id || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      BEGIN
        UPDATE users SET unique_id = new_id WHERE id = r.id;
        EXIT; -- success
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts > 20 THEN
          -- Fallback: clock_timestamp()-based ID to guarantee uniqueness even within a transaction
          new_id := 'U' || upper(to_hex(extract(epoch from clock_timestamp())::bigint));
          UPDATE users SET unique_id = new_id WHERE id = r.id;
          EXIT;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
