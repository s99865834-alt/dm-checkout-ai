-- Per-shop aggregates for /admin, computed in the database.
--
-- The dashboard used to fetch every row of links_sent, attribution and
-- order_sightings and count them in JavaScript. PostgREST caps a select at
-- 1,000 rows and says nothing when it truncates, so once links_sent passed
-- 1,000 the dashboard froze: it kept counting the oldest 1,000 rows and
-- silently dropped everything newer. On 11 Sep 2026 links_sent held 1,065 rows
-- and Love By Luna's message count had been stuck on 196 for days while the
-- true figure was 208. A reply sent during a live test changed nothing on
-- screen, which is how it was caught.
--
-- Counting here instead is correct at any size, and the result is one row per
-- shop, so it cannot hit the same cap. Any future dashboard number belongs in
-- this function rather than in a fetch-and-count loop.
create or replace function admin_shop_stats()
returns table (
  shop_id uuid,
  messages_sent bigint,
  undelivered bigint,
  revenue numeric,
  orders_seen bigint,
  orders_attributed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as shop_id,
    coalesce(l.delivered, 0) as messages_sent,
    coalesce(l.undelivered, 0) as undelivered,
    coalesce(a.revenue, 0) as revenue,
    coalesce(o.seen, 0) as orders_seen,
    coalesce(o.attributed, 0) as orders_attributed
  from shops s
  left join (
    -- One reply writes several rows (a claim row plus one per link it sent),
    -- so replies are counted by distinct message, and a reply Instagram
    -- refused is counted separately rather than as delivered.
    select
      shop_id,
      count(distinct message_id) filter (
        where failed_reason is null and message_id is not null
      ) as delivered,
      count(*) filter (where failed_reason is not null) as undelivered
    from links_sent
    group by shop_id
  ) l on l.shop_id = s.id
  left join (
    select shop_id, sum(amount) as revenue
    from attribution
    group by shop_id
  ) a on a.shop_id = s.id
  left join (
    select
      shop_id,
      count(*) as seen,
      count(*) filter (where attributed) as attributed
    from order_sightings
    group by shop_id
  ) o on o.shop_id = s.id;
$$;

revoke all on function admin_shop_stats() from public, anon, authenticated;
grant execute on function admin_shop_stats() to service_role;
