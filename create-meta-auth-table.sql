-- Meta authentication table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS meta_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL, -- Facebook Page ID
  ig_business_id TEXT NOT NULL, -- Instagram Business Account ID
  user_access_token TEXT NOT NULL, -- Encrypted user access token
  page_access_token TEXT NOT NULL, -- Encrypted page access token
  ig_access_token TEXT, -- Encrypted Instagram access token
  token_expires_at TIMESTAMPTZ, -- Token expiration timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, page_id) -- One connection per shop per page
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_meta_auth_shop_id ON meta_auth(shop_id);
CREATE INDEX IF NOT EXISTS idx_meta_auth_ig_business_id ON meta_auth(ig_business_id);

-- Add comment for documentation
COMMENT ON TABLE meta_auth IS 'Stores Meta (Facebook/Instagram) authentication tokens for each shop';

