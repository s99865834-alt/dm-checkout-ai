-- Scalability Optimization: Queue & Rate-Limit SQL Functions
-- Run this in the Supabase Dashboard → SQL Editor
-- These functions make queue processing and rate limiting atomic (race-condition safe).

-- 1. Atomic rate-limit: INSERT or INCREMENT in one statement, return whether within limit
CREATE OR REPLACE FUNCTION increment_and_check_rate_limit(
  p_shop_id uuid,
  p_window_start timestamptz,
  p_max int
)
RETURNS boolean
LANGUAGE sql
AS $$
  INSERT INTO dm_rate_limit (shop_id, window_start, count)
  VALUES (p_shop_id, p_window_start, 1)
  ON CONFLICT (shop_id, window_start)
  DO UPDATE SET count = dm_rate_limit.count + 1
  RETURNING count <= p_max;
$$;

-- 2. Add processing_since column to track when rows entered processing state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbound_dm_queue' AND column_name = 'processing_since'
  ) THEN
    ALTER TABLE outbound_dm_queue ADD COLUMN processing_since timestamptz;
  END IF;
END $$;

-- 3. Atomic queue claiming: SELECT + UPDATE in one statement using FOR UPDATE SKIP LOCKED
--    Prevents duplicate sends when cron runs overlap or multiple instances run.
CREATE OR REPLACE FUNCTION claim_dm_queue_batch(p_limit int)
RETURNS SETOF outbound_dm_queue
LANGUAGE sql
AS $$
  UPDATE outbound_dm_queue
  SET status = 'processing', updated_at = now(), processing_since = now()
  WHERE id IN (
    SELECT id FROM outbound_dm_queue
    WHERE status = 'pending' AND not_before <= now()
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- 4. Reset stuck processing rows (rows stuck in 'processing' for > N minutes)
CREATE OR REPLACE FUNCTION reset_stuck_processing_rows(p_timeout_minutes int DEFAULT 5)
RETURNS int
LANGUAGE sql
AS $$
  WITH reset AS (
    UPDATE outbound_dm_queue
    SET status = 'pending', processing_since = NULL, updated_at = now()
    WHERE status = 'processing'
      AND processing_since < now() - (p_timeout_minutes || ' minutes')::interval
    RETURNING id
  )
  SELECT count(*)::int FROM reset;
$$;
