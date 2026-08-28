/**
 * The human-takeover pause must not fire before automation has ever replied
 * for a shop. Merchants test by DMing their own account and answering by hand;
 * that manual answer used to arm a 6-hour pause, so their next test message got
 * no reply and the app looked broken. Regression cover for that path.
 */
import { describe, it, expect, vi } from "vitest";

const state = vi.hoisted(() => ({ replyRow: null, error: null, queries: 0 }));

vi.mock("../app/lib/supabase.server", () => {
  function makeChain(table) {
    const chain = {};
    for (const m of [
      "select", "insert", "update", "upsert", "delete", "eq", "neq", "gt",
      "gte", "lt", "lte", "in", "is", "not", "or", "like", "ilike", "match",
      "contains", "order", "limit", "range",
    ]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = async () => {
      if (table !== "links_sent") return { data: null, error: null };
      state.queries += 1;
      return { data: state.replyRow, error: state.error };
    };
    chain.single = chain.maybeSingle;
    chain.then = (resolve, reject) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject);
    return chain;
  }
  return {
    default: {
      from: (table) => makeChain(table),
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

const { hasEverSentAutomatedReply } = await import("../app/lib/db.server");

describe("onboarding grace for the human-takeover pause", () => {
  it("reports no prior reply for a brand new shop, so no pause is armed", async () => {
    state.replyRow = null;
    state.error = null;
    expect(await hasEverSentAutomatedReply("shop-brand-new")).toBe(false);
  });

  it("reports a prior reply once the bot has answered, so the pause works", async () => {
    state.replyRow = { id: "link-row-1" };
    state.error = null;
    expect(await hasEverSentAutomatedReply("shop-established")).toBe(true);
  });

  it("caches the established result instead of re-querying every echo", async () => {
    state.replyRow = { id: "link-row-2" };
    state.error = null;
    await hasEverSentAutomatedReply("shop-cached");
    const after = state.queries;
    await hasEverSentAutomatedReply("shop-cached");
    await hasEverSentAutomatedReply("shop-cached");
    expect(state.queries).toBe(after);
  });

  it("fails closed on a database error so takeover still protects the merchant", async () => {
    state.replyRow = null;
    state.error = { message: "connection reset" };
    expect(await hasEverSentAutomatedReply("shop-db-error")).toBe(true);
    state.error = null;
  });

  it("treats a missing shop id as established rather than granting grace", async () => {
    expect(await hasEverSentAutomatedReply(null)).toBe(false);
  });
});
