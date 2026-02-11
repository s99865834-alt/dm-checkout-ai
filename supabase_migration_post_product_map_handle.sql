-- Add product_handle to post_product_map so we can build PDP URLs without calling Shopify at runtime.
-- Run this in your Supabase SQL editor (or apply via your migration process).

ALTER TABLE post_product_map
ADD COLUMN IF NOT EXISTS product_handle TEXT;

COMMENT ON COLUMN post_product_map.product_handle IS 'Shopify product handle for /products/{handle} URLs; set when mapping is saved.';
