-- created_at is the first install and never moves, so a shop that installed
-- before Free closed could uninstall and reinstall to get Free back.
-- installed_at is written on every install and reinstall. Null means the shop
-- has not reinstalled since this column was added, and created_at stands in.
alter table public.shops add column if not exists installed_at timestamptz;
