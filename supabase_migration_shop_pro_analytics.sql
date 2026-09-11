-- The Pro analytics figures, computed in the database.
--
-- Third instance of the same flaw. getProAnalytics fetched a shop's whole
-- messages table with select("*"), plus attribution, links_sent and clicks,
-- and aggregated in JavaScript. PostgREST truncates a select at 1,000 rows
-- without saying so, which had already frozen /admin for days and was about a
-- week from corrupting the main analytics page.
--
-- Each definition below mirrors the JavaScript it replaces, including the
-- awkward parts, so no merchant-visible number moves:
--
--   * a customer counts as "first time" on exactly one message, "repeat" on
--     two or more
--   * sentiment is matched on substring, positive tested before negative,
--     anything else falling to neutral
--   * the link representing a message is the one with the greatest id when
--     compared as text, which is what String(a) > String(b) did to uuids
--   * follow-up "clicks" counts messages that got at least one click, not
--     click events, and only checkout links were ever queried for clicks
--   * revenue attaches to the message whose representative link matches the
--     attribution row
create or replace function shop_pro_analytics(
  p_shop_id uuid,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_product_id text default null
)
returns table (
  first_time_customers bigint,
  repeat_customers bigint,
  total_customers bigint,
  sentiment_positive bigint,
  sentiment_negative bigint,
  sentiment_neutral bigint,
  sentiment_total bigint,
  revenue_total numeric,
  revenue_dm numeric,
  revenue_comment numeric,
  revenue_currency text,
  followup_with_messages bigint,
  followup_with_clicks bigint,
  followup_with_revenue numeric,
  followup_without_messages bigint,
  followup_without_clicks bigint,
  followup_without_revenue numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with post_filter as (
    select distinct ls.message_id
    from links_sent ls
    where p_product_id is not null
      and ls.shop_id = p_shop_id
      and ls.product_id = p_product_id
      and ls.message_id is not null
      and (p_start is null or ls.sent_at >= p_start)
      and (p_end is null or ls.sent_at <= p_end)
  ),
  scoped_messages as (
    select m.id, m.from_user_id, m.sentiment
    from messages m
    where m.shop_id = p_shop_id
      and (p_start is null or m.created_at >= p_start)
      and (p_end is null or m.created_at <= p_end)
      and (p_product_id is null or m.id in (select pf.message_id from post_filter pf))
  ),
  per_customer as (
    select from_user_id, count(*) as n
    from scoped_messages
    where from_user_id is not null
    group by from_user_id
  ),
  scoped_attribution as (
    select a.link_id, a.channel, a.amount, a.currency
    from attribution a
    where a.shop_id = p_shop_id
      and (p_start is null or a.created_at >= p_start)
      and (p_end is null or a.created_at <= p_end)
  ),
  -- One link per message: greatest id compared as text, matching the
  -- String(link.id) > String(prev.rowId) the JavaScript used on uuids.
  representative_link as (
    select distinct on (ls.message_id) ls.message_id, ls.link_id
    from links_sent ls
    where ls.shop_id = p_shop_id
      and ls.message_id is not null
      and ls.message_id in (select sm.id from scoped_messages sm)
    order by ls.message_id, ls.id::text desc
  ),
  with_followup as (
    select distinct f.message_id
    from followups f
    where f.shop_id = p_shop_id
      and f.message_id in (select sm.id from scoped_messages sm)
  ),
  -- Only checkout links were ever passed to the clicks query, so a message
  -- whose representative link is a pdp_ or info_ link registers no click.
  message_stats as (
    select
      rl.message_id,
      (rl.message_id in (select wf.message_id from with_followup wf)) as has_followup,
      (
        rl.link_id ~ '^[a-zA-Z0-9]{8}$'
        and exists (select 1 from clicks c where c.link_id = rl.link_id)
      ) as has_click,
      coalesce((
        select sum(sa.amount)
        from scoped_attribution sa
        where sa.link_id = rl.link_id
      ), 0) as revenue
    from representative_link rl
  )
  select
    (select count(*) from per_customer where n = 1),
    (select count(*) from per_customer where n > 1),
    (select count(*) from per_customer),
    (select count(*) from scoped_messages where sentiment is not null and lower(sentiment) like '%positive%'),
    (select count(*) from scoped_messages
       where sentiment is not null
         and lower(sentiment) not like '%positive%'
         and lower(sentiment) like '%negative%'),
    (select count(*) from scoped_messages
       where sentiment is not null
         and lower(sentiment) not like '%positive%'
         and lower(sentiment) not like '%negative%'),
    (select count(*) from scoped_messages where sentiment is not null),
    (select coalesce(sum(amount), 0) from scoped_attribution),
    (select coalesce(sum(amount), 0) from scoped_attribution where channel = 'dm'),
    (select coalesce(sum(amount), 0) from scoped_attribution where channel = 'comment'),
    (select currency from scoped_attribution where currency is not null limit 1),
    (select count(*) from message_stats where has_followup),
    (select count(*) from message_stats where has_followup and has_click),
    (select coalesce(sum(revenue), 0) from message_stats where has_followup),
    (select count(*) from message_stats where not has_followup),
    (select count(*) from message_stats where not has_followup and has_click),
    (select coalesce(sum(revenue), 0) from message_stats where not has_followup);
$$;

revoke all on function shop_pro_analytics(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function shop_pro_analytics(uuid, timestamptz, timestamptz, text)
  to service_role;
