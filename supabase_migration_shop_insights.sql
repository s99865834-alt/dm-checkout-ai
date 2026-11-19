-- Pro customer insights: the weekly "what your customers are asking" card.
--
-- One row per shop, replaced on each run. `data` holds topic labels, counts,
-- and message ids, never message text: the card reads quotes live from
-- messages, so a Meta data-deletion request that removes a customer's
-- messages also removes them from the card.
create table if not exists public.shop_insights (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  generated_at timestamptz not null default now(),
  status text not null,
  message_count integer not null default 0,
  data jsonb not null default '{}'::jsonb
);

-- Same as every other table: the app connects as service_role, which
-- bypasses RLS, and no policy means no external caller gets in.
alter table public.shop_insights enable row level security;

-- Every count shown on the card. Computed here so no figure depends on a
-- PostgREST select that silently stops at 1,000 rows.
create or replace function shop_insight_stats(
  p_shop_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped_messages as (
    select m.id, m.channel, m.ai_intent, m.sentiment
    from messages m
    where m.shop_id = p_shop_id
      and m.created_at >= p_start
      and m.created_at <= p_end
  ),
  scoped_links as (
    select ls.message_id, ls.product_id, ls.link_id, ls.failed_reason
    from links_sent ls
    where ls.shop_id = p_shop_id
      and ls.product_id is not null
      and ls.sent_at >= p_start
      and ls.sent_at <= p_end
  ),
  per_product as (
    select
      sl.product_id,
      count(distinct sl.message_id) as messages,
      count(distinct sl.link_id) filter (where sl.failed_reason is null) as links,
      count(distinct sl.link_id) filter (
        where sl.failed_reason is null
          and exists (select 1 from clicks c where c.link_id = sl.link_id)
      ) as clicked,
      (
        select count(distinct a.order_id)
        from attribution a
        where a.shop_id = p_shop_id
          and a.link_id in (select l2.link_id from scoped_links l2 where l2.product_id = sl.product_id)
      ) as orders,
      (
        select coalesce(sum(a.amount), 0)
        from attribution a
        where a.shop_id = p_shop_id
          and a.link_id in (select l2.link_id from scoped_links l2 where l2.product_id = sl.product_id)
      ) as revenue
    from scoped_links sl
    group by sl.product_id
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped_messages),
    'relevant', (select count(*) from scoped_messages
                 where ai_intent is not null and ai_intent <> 'not_relevant'),
    'by_intent', coalesce((select jsonb_object_agg(ai_intent, n) from (
        select ai_intent, count(*) as n from scoped_messages
        where ai_intent is not null group by ai_intent) i), '{}'::jsonb),
    'by_channel', coalesce((select jsonb_object_agg(channel, n) from (
        select coalesce(channel, 'dm') as channel, count(*) as n from scoped_messages
        group by coalesce(channel, 'dm')) c), '{}'::jsonb),
    'negative', (select count(*) from scoped_messages where lower(sentiment) = 'negative'),
    'currency', (select a.currency from attribution a
                 where a.shop_id = p_shop_id and a.currency is not null
                 order by a.created_at desc limit 1),
    'products', coalesce((select jsonb_agg(p order by p.messages desc, p.product_id) from (
        select * from per_product order by messages desc, product_id limit 15) p), '[]'::jsonb)
  );
$$;

revoke all on function shop_insight_stats(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function shop_insight_stats(uuid, timestamptz, timestamptz)
  to service_role;
