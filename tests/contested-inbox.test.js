/**
 * Detecting that something other than us is answering the account.
 *
 * The original app_id signal has never fired in production: of 1,199 outbound
 * replies from something that wasn't us, not one carried an app_id. So the
 * banner also keys off refused comment replies, which is the signal that
 * actually exists.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Per-table results for one test. db.server builds its Supabase client at
// import time, so the client is mocked rather than the network.
let results = {};

vi.mock("../app/lib/supabase.server", () => {
  function chain(table) {
    const c = {};
    for (const m of ["select", "eq", "neq", "gte", "lte", "like", "ilike", "is", "in", "not", "order", "limit"]) {
      c[m] = () => c;
    }
    c.then = (resolve, reject) =>
      Promise.resolve(results[table] ?? { data: [], error: null, count: 0 }).then(resolve, reject);
    return c;
  }
  return { default: { from: (table) => chain(table), rpc: async () => ({ data: null, error: null }) } };
});

const { getCompetingToolStatus } = await import("../app/lib/db.server");

const SHOP = "shop-1";

/** n distinct conversations touched by one foreign app. */
const foreignApp = (appId, n) => ({
  data: Array.from({ length: n }, (_, i) => ({ app_id: appId, ig_user_id: `user-${i}` })),
  error: null,
});

beforeEach(() => {
  results = {
    tool_detections: { data: [], error: null },
    links_sent: { count: 0, error: null },
  };
});

describe("getCompetingToolStatus", () => {
  it("reports nothing on a quiet account", async () => {
    const status = await getCompetingToolStatus(SHOP);
    expect(status).toEqual({ detected: false, appId: null, conversations: 0, intercepted: 0 });
  });

  it("fires on a run of refused comment replies", async () => {
    results.links_sent = { count: 3, error: null };

    const status = await getCompetingToolStatus(SHOP);

    expect(status.detected).toBe(true);
    expect(status.intercepted).toBe(3);
  });

  it.each([1, 2])(
    "stays quiet on %s refused reply, which is just as likely the merchant answering by hand",
    async (count) => {
      results.links_sent = { count, error: null };

      const status = await getCompetingToolStatus(SHOP);

      expect(status.detected).toBe(false);
      expect(status.intercepted).toBe(count);
    }
  );

  it("still fires on a foreign app id, if one ever appears", async () => {
    results.tool_detections = foreignApp("manychat-123", 4);

    const status = await getCompetingToolStatus(SHOP);

    expect(status.detected).toBe(true);
    expect(status.appId).toBe("manychat-123");
    expect(status.conversations).toBe(4);
  });

  it("ignores a foreign app seen in only a couple of conversations", async () => {
    results.tool_detections = foreignApp("manychat-123", 2);

    const status = await getCompetingToolStatus(SHOP);

    expect(status.detected).toBe(false);
  });

  it("reports both signals when both are present", async () => {
    results.tool_detections = foreignApp("manychat-123", 5);
    results.links_sent = { count: 7, error: null };

    const status = await getCompetingToolStatus(SHOP);

    expect(status.detected).toBe(true);
    expect(status.appId).toBe("manychat-123");
    expect(status.intercepted).toBe(7);
  });

  it("still reports interceptions when the app_id query fails", async () => {
    // Failing closed on one signal must not blind the other.
    results.tool_detections = { data: null, error: { message: "boom" } };
    results.links_sent = { count: 4, error: null };

    const status = await getCompetingToolStatus(SHOP);

    expect(status.detected).toBe(true);
    expect(status.intercepted).toBe(4);
  });

  it("fails closed when the interception query errors", async () => {
    results.links_sent = { count: null, error: { message: "boom" } };

    const status = await getCompetingToolStatus(SHOP);

    expect(status.detected).toBe(false);
    expect(status.intercepted).toBe(0);
  });

  it.each([null, undefined, ""])("returns the empty shape for %s", async (shopId) => {
    const status = await getCompetingToolStatus(shopId);
    expect(status).toEqual({ detected: false, appId: null, conversations: 0, intercepted: 0 });
  });
});
