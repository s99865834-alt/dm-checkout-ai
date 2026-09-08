-- Every order we were told about, so "is attribution working?" is answerable.
--
-- The orders/create handler records a row in `attribution` when it finds a
-- link id, and otherwise logs one debug line and stores nothing. That makes the
-- question unfalsifiable: "nobody who clicked bought" and "people bought and we
-- missed them" look identical afterwards. On 8 Sep 2026 there were 108 checkout
-- links, 19 verified human clicks, and zero attributed orders, and there was no
-- way to tell which of those two it was.
--
-- Data minimisation, same posture as the webhook handler: no customer field is
-- read or stored. Order id, amount and currency only, plus booleans for which
-- attribution signal was present, which is what actually diagnoses a failure.
-- The landing_site string itself is deliberately NOT stored, since it is
-- attacker-influenced and can carry arbitrary query content.
create table if not exists order_sightings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  order_id text not null,
  seen_at timestamptz not null default now(),
  -- Did we manage to credit it to a link?
  attributed boolean not null default false,
  amount numeric,
  currency text,
  -- Which signal carried the link id. cart_ref survives a purchase made days
  -- later; landing_ref only covers the same browsing session. If sightings
  -- accumulate with both false, the ref is being lost before checkout.
  had_cart_ref boolean not null default false,
  had_landing_ref boolean not null default false,
  -- Shopify retries webhooks, so the same order can arrive more than once.
  unique (shop_id, order_id)
);

create index if not exists order_sightings_shop_seen_idx
  on order_sightings (shop_id, seen_at desc);

alter table order_sightings enable row level security;

-- Written only by the webhook handler, which uses the service role. No anon or
-- authenticated access, matching every other table holding shop data.
drop policy if exists "order_sightings_service_role_all" on order_sightings;
create policy "order_sightings_service_role_all"
  on order_sightings for all to service_role
  using (true) with check (true);
