-- Add reply_language to brand_voice for customer-facing reply language control.
-- Run this in your Supabase SQL editor.
-- Values: 'auto' (default, reply in the customer's language) | a locale code
--         like 'pt-BR', 'en', 'es', 'fr', 'de', 'it', 'nl' to force that language.

ALTER TABLE brand_voice
ADD COLUMN IF NOT EXISTS reply_language TEXT DEFAULT 'auto';

COMMENT ON COLUMN brand_voice.reply_language IS 'auto = reply in the customer''s language; otherwise a locale code (e.g. pt-BR, en, es) that forces all replies into that language';
