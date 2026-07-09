-- Flip per-post automation storage from an allow-list (enabled_post_ids,
-- empty = all enabled) to a deny-list (disabled_post_ids).
--
-- With the allow-list, disabling a single post forced the app to snapshot
-- "every other post" from whatever was loaded in the browser — silently
-- disabling unloaded and future posts. A deny-list makes the default
-- (automation on) apply to everything not explicitly turned off.
--
-- Applied to production via Supabase MCP on 2026-07-09
-- (migration name: add_disabled_post_ids_to_settings).

ALTER TABLE settings ADD COLUMN IF NOT EXISTS disabled_post_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Only one shop (a dev test store) ever had a non-empty enabled_post_ids;
-- reset to all-enabled rather than computing the complement per shop.
UPDATE settings SET enabled_post_ids = NULL;
