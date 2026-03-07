-- Beta Trial System Migration
-- Run this in the Supabase Dashboard → SQL Editor

-- 1. beta_codes: stores redeemable invite codes you generate
CREATE TABLE IF NOT EXISTS beta_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  max_uses int NOT NULL DEFAULT 1,
  times_used int NOT NULL DEFAULT 0,
  trial_days int NOT NULL DEFAULT 60,
  plan_level text NOT NULL DEFAULT 'PRO',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,          -- NULL = never expires
  active boolean NOT NULL DEFAULT true
);

-- 2. beta_redemptions: tracks which shop redeemed which code
CREATE TABLE IF NOT EXISTS beta_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_code_id uuid NOT NULL REFERENCES beta_codes(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  trial_expires_at timestamptz NOT NULL,
  UNIQUE (beta_code_id, shop_id)
);

-- 3. Add beta_trial_expires_at to shops (denormalized for fast lookups)
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS beta_trial_expires_at timestamptz;

-- 4. Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_beta_codes_code ON beta_codes(code);
CREATE INDEX IF NOT EXISTS idx_beta_redemptions_shop ON beta_redemptions(shop_id);

-- 5. RLS policies (service role bypasses RLS, but good practice)
ALTER TABLE beta_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on beta_codes"
  ON beta_codes FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on beta_redemptions"
  ON beta_redemptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Generate 100 beta codes (60-day trial, PRO plan, 1 use each)
INSERT INTO beta_codes (code, max_uses, trial_days, plan_level)
SELECT
  'BETA-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
  1,
  60,
  'PRO'
FROM generate_series(1, 100)
ON CONFLICT (code) DO NOTHING;
