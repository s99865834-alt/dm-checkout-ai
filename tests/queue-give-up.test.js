/**
 * A reply the queue gives up on must stop counting as delivered.
 *
 * Usage is charged when a reply is handed off, not when it lands: the caller
 * sees {queued: true}, treats it as success and calls incrementUsage. So a
 * queued DM that later exhausted its attempts was recorded as a delivered,
 * billed message that no customer received, because nothing wrote
 * failed_reason and the admin's "messages sent" counts rows where that column
 * is null.
 *
 * That happened for real on 29 Sep 2026 to the first DM our first paying
 * merchant received, and had to be corrected by hand.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  shopUsage: 5,
  claimRow: { link_id: "dm_reply_ext_abc" },
  undelivered: [],
  usageWrites: [],
}));

vi.mock("../app/lib/supabase.server", () => {
  const shops = {
    select: () => shops,
    eq: () => shops,
    maybeSingle: async () => ({ data: { usage_count: state.shopUsage }, error: null }),
    update: (patch) => {
      state.usageWrites.push(patch);
      return { eq: async () => ({ error: null }) };
    },
  };
  const links = {
    select: () => links,
    eq: () => links,
    is: () => links,
    order: () => links,
    limit: () => links,
    maybeSingle: async () => ({ data: state.claimRow, error: null }),
    update: (patch) => {
      state.undelivered.push(patch);
      return { eq: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }) };
    },
  };
  return { default: { from: (t) => (t === "shops" ? shops : links) } };
});

const { markReplyUndelivered, refundUsage } = await import("../app/lib/db.server");

beforeEach(() => {
  state.shopUsage = 5;
  state.claimRow = { link_id: "dm_reply_ext_abc" };
  state.undelivered = [];
  state.usageWrites = [];
});

describe("markReplyUndelivered", () => {
  it("records why the reply never landed, so it stops reading as delivered", async () => {
    await markReplyUndelivered("shop-1", "dm_reply_ext_abc", "dm_queue_exhausted");
    expect(state.undelivered[0].failed_reason).toBe("dm_queue_exhausted");
  });

  it("falls back to a reason rather than writing nothing", async () => {
    await markReplyUndelivered("shop-1", "dm_reply_ext_abc", null);
    expect(state.undelivered[0].failed_reason).toBe("unknown");
  });
});

describe("refundUsage", () => {
  it("hands the message allowance back", async () => {
    await refundUsage("shop-1", 1);
    expect(state.usageWrites[0]).toEqual({ usage_count: 4 });
  });

  it("never drives a counter negative", async () => {
    state.shopUsage = 0;
    await refundUsage("shop-1", 1);
    expect(state.usageWrites[0]).toEqual({ usage_count: 0 });
  });

  it("ignores a nonsense refund instead of corrupting the count", async () => {
    await refundUsage("shop-1", 0);
    await refundUsage(null, 1);
    await refundUsage("shop-1", -3);
    expect(state.usageWrites).toHaveLength(0);
  });
});
