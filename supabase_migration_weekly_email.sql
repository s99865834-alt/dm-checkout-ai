-- Weekly merchant email. Rules live in app/lib/weekly-email.js.

-- One row per shop per week. The unique key is what stops a restart or a
-- second server from sending the same week's email twice.
create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  week_start date not null,
  kind text not null,
  extras text[] not null default '{}',
  recipient text,
  status text not null default 'pending',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (shop_id, week_start)
);
create index if not exists email_sends_shop_created on public.email_sends (shop_id, created_at desc);
alter table public.email_sends enable row level security;

create table if not exists public.email_optouts (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  opted_out_at timestamptz not null default now(),
  reason text
);
alter table public.email_optouts enable row level security;
