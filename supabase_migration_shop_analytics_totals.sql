-- Every number on the merchant analytics page, computed in the database.
--
-- getAnalytics used to fetch all of a shop's messages and links_sent rows and
-- aggregate them in JavaScript. PostgREST truncates a select at 1,000 rows and
-- says nothing, so this was on a timer: on 11 Sep 2026 Shanesecares stood at
-- 867 messages and Mark Watts at 860, roughly a week from the point where
-- their own analytics would start under-reporting. The same flaw had already
-- frozen /admin for days once links_sent passed 1,000.
--
-- The page defaults to no date filter, so the failure would have been
-- permanent rather than limited to one view.
--
-- Everything here is an aggregate, including the trigger phrases (a group by
-- on intent) and the channel split, so nothing needs to leave the database.
-- That makes the cost constant with history instead of linear, and removes the
-- truncation risk rather than moving it.
--
-- The checkout-link test is `link_id ~ '^[a-zA-Z0-9]{8}$'`, which must stay
-- identical to isCheckoutLinkId in app/lib/checkout-link-id.js. A test asserts
-- the two agree on the same examples, because a silent disagreement here would
-- misreport every link KPI.
create or replace function shop_analytics_totals(
  p_shop_id uuid,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_product_id text default null
)
returns table (
  messages_received bigint,
  responded_messages bigint,
  checkout_links_sent bigint,
  clicks bigint,
  unique_links_clicked bigint,
  dm_sent bigint,
  dm_responded bigint,
  dm_clicks bigint,
  comment_sent bigint,
  comment_responded bigint,
  comment_clicks bigint,
  top_intents jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_links as (
    -- Refused replies are excluded: a reply Instagram never delivered is not
    -- a response, and counting it inflated the response rate.
    select ls.id, ls.message_id, ls.link_id
    from links_sent ls
    where ls.shop_id = p_shop_id
      and ls.failed_reason is null
      and (p_start is null or ls.sent_at >= p_start)
      and (p_end is null or ls.sent_at <= p_end)
      and (p_product_id is null or ls.product_id = p_product_id)
  ),
  scoped_messages as (
    select m.id, m.channel, m.ai_intent
    from messages m
    where m.shop_id = p_shop_id
      and (p_start is null or m.created_at >= p_start)
      and (p_end is null or m.created_at <= p_end)
      and (
        p_product_id is null
        or m.id in (select sl.message_id from scoped_links sl where sl.message_id is not null)
      )
  ),
  -- A message counts as answered if any link row belongs to it, whatever the
  -- link type, which is what the JavaScript version did.
  responded as (
    select distinct sl.message_id
    from scoped_links sl
    where sl.message_id is not null
      and exists (select 1 from scoped_messages sm where sm.id = sl.message_id)
  ),
  checkout_links as (
    select distinct sl.link_id
    from scoped_links sl
    where sl.link_id ~ '^[a-zA-Z0-9]{8}$'
  ),
  link_channel as (
    select distinct sl.link_id, sm.channel
    from scoped_links sl
    join scoped_messages sm on sm.id = sl.message_id
    where sl.link_id ~ '^[a-zA-Z0-9]{8}$'
  ),
  clicked as (
    select c.link_id
    from clicks c
    where c.link_id in (select cl.link_id from checkout_links cl)
  )
  select
    (select count(*) from scoped_messages),
    (select count(*) from responded),
    (select count(*) from checkout_links),
    (select count(*) from clicked),
    (select count(distinct cl.link_id) from clicked cl),
    (select count(*) from scoped_messages where channel = 'dm'),
    (select count(*) from responded r join scoped_messages sm on sm.id = r.message_id where sm.channel = 'dm'),
    (select count(*) from clicked cl join link_channel lc on lc.link_id = cl.link_id where lc.channel = 'dm'),
    (select count(*) from scoped_messages where channel = 'comment'),
    (select count(*) from responded r join scoped_messages sm on sm.id = r.message_id where sm.channel = 'comment'),
    (select count(*) from clicked cl join link_channel lc on lc.link_id = cl.link_id where lc.channel = 'comment'),
    (
      select coalesce(jsonb_agg(jsonb_build_object('intent', t.intent, 'count', t.count)), '[]'::jsonb)
      from (
        select sm.ai_intent as intent, count(*) as count
        from scoped_messages sm
        join responded r on r.message_id = sm.id
        where sm.ai_intent is not null
        group by sm.ai_intent
        order by count(*) desc
        limit 3
      ) t
    );
$$;

revoke all on function shop_analytics_totals(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function shop_analytics_totals(uuid, timestamptz, timestamptz, text)
  to service_role;

-- The clicks lookup joins on link_id; links_sent.link_id is already unique.
create index if not exists clicks_link_id_idx on clicks (link_id);
