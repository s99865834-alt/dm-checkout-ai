-- Welcome email on install. One row per shop; resent on reinstall only after
-- WELCOME_RESEND_DAYS (app/lib/welcome-email.js).
create table if not exists public.email_welcomes (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  sent_at timestamptz not null default now(),
  recipient text,
  status text not null default 'pending',
  provider_message_id text,
  error text
);
alter table public.email_welcomes enable row level security;
