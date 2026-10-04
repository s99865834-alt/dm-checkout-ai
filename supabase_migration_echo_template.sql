-- Tell Instagram's canned replies apart from the merchant typing.
--
-- Meta echoes every outbound message on an account and we previously armed the
-- human-takeover pause for anything that wasn't ours. Instagram's native
-- Instant Reply and Away Message are server-side templates that answer
-- nothing, so a shop with those switched on silenced us on every conversation:
-- Shabby 2 Chic's customer asked about a dress, got opening hours 3 seconds
-- later, and the reply we had written was discarded.
--
-- Storing the echo text is what makes the two distinguishable. A template
-- repeats near-verbatim across different customers' threads; a merchant
-- answering two people says different things.

alter table human_takeovers
  add column if not exists last_echo_text text,
  add column if not exists last_echo_at timestamptz,
  add column if not exists last_echo_was_template boolean;

-- last_human_at has to be able to hold "no human has replied here yet".
--
-- Recording a template must never arm the pause, and the write omits
-- last_human_at so an existing genuine pause is preserved on conflict. With
-- NOT NULL and a now() default still in place, that omission would insert
-- now() on a brand new conversation and pause it anyway, which is the exact
-- bug this migration exists to fix. isHumanTakeoverActive already treats a
-- missing last_human_at as "not paused".
alter table human_takeovers alter column last_human_at drop default;
alter table human_takeovers alter column last_human_at drop not null;

-- Reading "which of this shop's other conversations saw this same text" on
-- every outbound echo, and counting template conversations for the home page
-- banner. Partial so it stays small: most rows never carry echo text.
create index if not exists human_takeovers_shop_echo_idx
  on human_takeovers (shop_id, last_echo_at desc)
  where last_echo_text is not null;
