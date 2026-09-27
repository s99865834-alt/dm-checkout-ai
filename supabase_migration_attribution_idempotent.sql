-- One attribution row per order, so a retried webhook cannot double-count.
--
-- orders/create is at-least-once: Shopify retries on any non-2xx and on a
-- timeout, and the handler returns 500 on an unexpected error. order_sightings
-- already had a unique (shop_id, order_id) and upserts. attribution did not,
-- so a retry would insert a second row and inflate attributed revenue. Nothing
-- had noticed because only one order had ever been credited.
--
-- Safe to run: checked for duplicates on 27 Sep 2026 and found none.

create unique index if not exists attribution_shop_order_key
  on attribution (shop_id, order_id);
