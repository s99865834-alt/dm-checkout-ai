-- Add auth_type to meta_auth for Instagram Login (Business Login) support.
-- Run this in your Supabase SQL editor if you use Instagram Login.
-- Values: 'facebook' (default, Facebook Login + Page) | 'instagram' (Instagram Login, no Page)

ALTER TABLE meta_auth
ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'facebook';

COMMENT ON COLUMN meta_auth.auth_type IS 'facebook = Facebook Login (Page token), instagram = Instagram Login (Business Login, no Page)';
