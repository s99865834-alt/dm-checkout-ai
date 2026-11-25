-- One-time emails at a store's milestones, starting with its first 10
-- answered customer questions (app/lib/milestone-email.js). One row per shop
-- and milestone, claimed before sending, so each goes out once.
create table if not exists public.email_milestones (
  shop_id uuid not null references public.shops(id) on delete cascade,
  milestone text not null,
  sent_at timestamptz not null default now(),
  recipient text,
  status text not null default 'pending',
  provider_message_id text,
  error text,
  primary key (shop_id, milestone)
);
alter table public.email_milestones enable row level security;
