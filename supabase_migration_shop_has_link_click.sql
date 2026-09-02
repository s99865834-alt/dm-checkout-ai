-- Has anyone ever clicked a link this shop sent?
--
-- Gates the App Store review prompt. It used to fire on 20 replies sent, which
-- proves the app is running rather than working: Shanesecares saw the prompt on
-- 2 Sep 2026 with 60 replies sent, 2 checkout links, and zero attributed
-- orders, so at that moment nothing showed the app had earned them anything.
-- Shopify displays that modal at most once every 60 days, so the ask is worth
-- spending on a merchant who has seen a customer act.
--
-- A function rather than two round trips from the loader: clicks has no
-- foreign key to links_sent, so PostgREST can't embed it, and the alternative
-- is pulling every link id for the shop into an `in (...)` list.
create or replace function shop_has_link_click(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from clicks c
    join links_sent ls on ls.link_id = c.link_id
    where ls.shop_id = p_shop_id
  );
$$;

revoke all on function shop_has_link_click(uuid) from public, anon, authenticated;
grant execute on function shop_has_link_click(uuid) to service_role;

-- The join above looks clicks up by link_id. links_sent.link_id is already
-- unique; this covers the other side.
create index if not exists clicks_link_id_idx on clicks (link_id);
