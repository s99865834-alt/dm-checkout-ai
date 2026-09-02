-- Records why an automated reply never reached the customer.
--
-- The claim row in links_sent is written *before* the send, so it reserves the
-- one reply Instagram allows per comment and stops duplicate webhooks racing.
-- When the send is then rejected, the row stayed behind indistinguishable from
-- a delivered reply, so both /admin and the merchant's response rate counted a
-- message that nobody received.
--
-- NULL means delivered (or a plain link row). Non-NULL means the reply was
-- composed and rejected, and every count must skip it.
alter table links_sent
  add column if not exists failed_reason text;

-- The counts filter on "failed_reason is null", so a partial index on the
-- failures keeps that predicate cheap without indexing the whole table.
create index if not exists links_sent_failed_reason_idx
  on links_sent (shop_id)
  where failed_reason is not null;
