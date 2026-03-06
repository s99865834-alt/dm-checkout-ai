-- Enable RLS on dm_rate_limit (required by Supabase for public tables).
-- The app uses the service role key, which bypasses RLS, so behavior is unchanged.
-- Run in Supabase Dashboard → SQL Editor.

ALTER TABLE public.dm_rate_limit ENABLE ROW LEVEL SECURITY;
