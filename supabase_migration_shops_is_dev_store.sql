-- Shopify development stores (shop.plan.partnerDevelopment). They can install
-- the app but are not merchants, so /admin badges them and leaves them out of
-- the store counts. Null means not checked yet; it is written on install,
-- reinstall, and the next app open.
alter table public.shops add column if not exists is_dev_store boolean;
