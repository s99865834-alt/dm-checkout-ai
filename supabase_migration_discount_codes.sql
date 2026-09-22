-- Single-use checkout discounts.
--
-- One Shopify discount per (shop, variant), each holding a small pool of
-- unique single-use redeem codes. A code is claimed at reply time and appended
-- to the cart permalink as ?discount=CODE, which is why the claim has to be a
-- single fast statement: it sits on the path of an Instagram private reply,
-- and Instagram allows exactly one of those per comment, so any delay loses
-- the race against other tools on the same account.
--
-- The codes are also the attribution key. Shopify records the applied code on
-- the order, so an order can be credited to the exact link that sent it
-- regardless of device, session or delay, which ref and cart attributes both
-- fail to do.

alter table settings
  add column if not exists discount_enabled boolean not null default false,
  add column if not exists discount_percentage integer;

-- Rollout control that is independent of plan. The capability is a Growth
-- feature in plans.js, but writes to a merchant's store should reach shops one
-- at a time first, and gating that on the plan would put the feature in the
-- wrong tier permanently.
alter table shops
  add column if not exists discounts_rollout_enabled boolean not null default false;

create table if not exists discount_pools (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  variant_id text not null,
  product_id text,
  product_title text,
  percentage integer not null,
  discount_node_id text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (shop_id, variant_id)
);

create table if not exists discount_codes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  pool_id uuid not null references discount_pools(id) on delete cascade,
  code text not null,
  link_id text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shop_id, code)
);

-- The claim path: unclaimed codes for one pool, oldest first.
create index if not exists discount_codes_available_idx
  on discount_codes (pool_id, created_at)
  where claimed_at is null;

-- The attribution path: order arrives with a code, find the link that sent it.
create index if not exists discount_codes_code_idx on discount_codes (code);
create index if not exists discount_codes_link_idx on discount_codes (link_id)
  where link_id is not null;

create index if not exists discount_pools_shop_idx on discount_pools (shop_id);

-- Claim one code for a variant, atomically.
--
-- SKIP LOCKED rather than a plain SELECT so two replies racing for the same
-- pool take different codes instead of both taking the first one and one of
-- them handing a customer a code that is already spent.
create or replace function claim_discount_code(
  p_shop_id uuid,
  p_variant_id text,
  p_link_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
  v_code text;
begin
  select dc.id, dc.code
    into v_code_id, v_code
  from discount_codes dc
  join discount_pools dp on dp.id = dc.pool_id
  where dc.shop_id = p_shop_id
    and dp.variant_id = p_variant_id
    and dc.claimed_at is null
  order by dc.created_at
  for update of dc skip locked
  limit 1;

  if v_code_id is null then
    return null;
  end if;

  update discount_codes
     set claimed_at = now(),
         link_id = p_link_id
   where id = v_code_id;

  update discount_pools
     set last_used_at = now()
   where shop_id = p_shop_id
     and variant_id = p_variant_id;

  return v_code;
end;
$$;

-- Pools that have run below the buffer, for the top-up job.
-- Returns a bounded set: PostgREST silently truncates selects at 1000 rows and
-- a partial list here would look like a healthy short queue.
create or replace function discount_pools_needing_topup(
  p_buffer integer default 5,
  p_limit integer default 200
) returns table (
  pool_id uuid,
  shop_id uuid,
  shopify_domain text,
  variant_id text,
  product_id text,
  product_title text,
  percentage integer,
  discount_node_id text,
  available integer
)
language sql
security definer
set search_path = public
as $$
  select dp.id,
         dp.shop_id,
         s.shopify_domain,
         dp.variant_id,
         dp.product_id,
         dp.product_title,
         dp.percentage,
         dp.discount_node_id,
         count(dc.id) filter (where dc.claimed_at is null)::int as available
  from discount_pools dp
  join shops s on s.id = dp.shop_id and s.active
  left join discount_codes dc on dc.pool_id = dp.id
  group by dp.id, s.shopify_domain
  having count(dc.id) filter (where dc.claimed_at is null) < p_buffer
  order by count(dc.id) filter (where dc.claimed_at is null) asc, dp.last_used_at desc nulls last
  limit p_limit;
$$;

-- Pools with no link sent for long enough that the discount is just clutter
-- in the merchant's admin. Never reaped while codes are still outstanding and
-- unredeemed would be wrong: a claimed code may still be sitting in a
-- customer's DMs, so age is measured from last use, not from creation.
create or replace function discount_pools_to_reap(
  p_days integer default 60,
  p_limit integer default 200
) returns table (
  pool_id uuid,
  shop_id uuid,
  shopify_domain text,
  discount_node_id text
)
language sql
security definer
set search_path = public
as $$
  select dp.id, dp.shop_id, s.shopify_domain, dp.discount_node_id
  from discount_pools dp
  join shops s on s.id = dp.shop_id
  where coalesce(dp.last_used_at, dp.created_at) < now() - make_interval(days => p_days)
  order by coalesce(dp.last_used_at, dp.created_at) asc
  limit p_limit;
$$;

revoke all on function claim_discount_code(uuid, text, text) from public, anon, authenticated;
revoke all on function discount_pools_needing_topup(integer, integer) from public, anon, authenticated;
revoke all on function discount_pools_to_reap(integer, integer) from public, anon, authenticated;

grant execute on function claim_discount_code(uuid, text, text) to service_role;
grant execute on function discount_pools_needing_topup(integer, integer) to service_role;
grant execute on function discount_pools_to_reap(integer, integer) to service_role;
