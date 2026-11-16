-- Meta's link scanner opens checkout links from Meta's network, disguised as a
-- browser. On 16 Nov 2026 it was 97 of 306 recorded checkout-link clicks. The
-- redirect no longer logs those (app/lib/meta-scanner.js); this keeps rows
-- logged before that out of the analytics totals without deleting them.
--
-- The channel CTR also divided raw clicks by replies, so a customer opening a
-- link several times, plus the scanner, put Comments at 373%. The new
-- *_links / *_links_clicked columns count each link once.
--
-- The ranges must match META_IPV4_CIDRS / META_IPV6_PREFIX in meta-scanner.js.
create or replace function is_meta_scanner_ip(p_ip inet)
returns boolean
language sql
immutable
as $$
  select p_ip is not null and (
    p_ip << any (array[
      '31.13.24.0/21', '31.13.64.0/18', '57.141.0.0/16', '66.220.144.0/20',
      '69.63.176.0/20', '69.171.224.0/19', '102.132.96.0/20', '129.134.0.0/16',
      '157.240.0.0/16', '173.252.64.0/18', '179.60.192.0/22', '185.60.216.0/22',
      '204.15.20.0/22', '2a03:2880::/32'
    ]::inet[])
  );
$$;

drop function if exists shop_analytics_totals(uuid, timestamptz, timestamptz, text);

create function shop_analytics_totals(
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
  top_intents jsonb,
  dm_links bigint,
  dm_links_clicked bigint,
  comment_links bigint,
  comment_links_clicked bigint
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
  -- Must stay identical to isCheckoutLinkId in app/lib/checkout-link-id.js.
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
      and not is_meta_scanner_ip(c.ip)
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
    ),
    (select count(*) from link_channel where channel = 'dm'),
    (select count(*) from link_channel lc where lc.channel = 'dm'
       and exists (select 1 from clicked cl where cl.link_id = lc.link_id)),
    (select count(*) from link_channel where channel = 'comment'),
    (select count(*) from link_channel lc where lc.channel = 'comment'
       and exists (select 1 from clicked cl where cl.link_id = lc.link_id));
$$;

revoke all on function shop_analytics_totals(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function shop_analytics_totals(uuid, timestamptz, timestamptz, text)
  to service_role;
