-- Per-page aggregates for /admin.
--
-- admin_shop_stats() returns one row per shop. PostgREST still caps that
-- result at 1,000 rows, so at 1,001 shops the dashboard would silently drop
-- the rest. This function takes the current page of shop ids (50) so the
-- payload cannot grow with install count.

create or replace function admin_shop_stats_for(p_shop_ids uuid[])
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
    select
      shop_id,
      count(distinct message_id) filter (
        where failed_reason is null and message_id is not null
      ) as delivered,
      count(*) filter (where failed_reason is not null) as undelivered
    from links_sent
    where shop_id = any(p_shop_ids)
    group by shop_id
  ) l on l.shop_id = s.id
  left join (
    select shop_id, sum(amount) as revenue
    from attribution
    where shop_id = any(p_shop_ids)
    group by shop_id
  ) a on a.shop_id = s.id
  left join (
    select
      shop_id,
      count(*) as seen,
      count(*) filter (where attributed) as attributed
    from order_sightings
    where shop_id = any(p_shop_ids)
    group by shop_id
  ) o on o.shop_id = s.id
  where s.id = any(p_shop_ids);
$$;

revoke all on function admin_shop_stats_for(uuid[]) from public, anon, authenticated;
grant execute on function admin_shop_stats_for(uuid[]) to service_role;
