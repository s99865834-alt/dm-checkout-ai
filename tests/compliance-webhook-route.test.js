/**
 * The compliance route must answer the no-op topics without any database work.
 *
 * That is the whole point of the change. 17 Oct 2026: ~160 customers/redact
 * events landed in one second, each queued behind the others on this app's
 * single pooled Prisma connection, and Shopify timed out at 5 seconds on most
 * of the burst. Asserting "returns 200" would pass even if the session load
 * came back, so these assert that neither the session store nor Supabase is
 * touched at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const SECRET = "shpss_test_secret_value_0123456789";
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");

// Every table touch funnels through here, so one spy proves the hot path is clean.
const supabaseFrom = vi.fn(() => {
  const chain = {};
  for (const m of ["select", "eq", "delete", "single", "maybeSingle"]) chain[m] = () => chain;
  chain.then = (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
  return chain;
});

vi.mock("../app/lib/supabase.server", () => ({
  default: {
    get from() {
      return supabaseFrom;
    },
  },
}));

const authenticateWebhookTolerant = vi.fn(async () => ({
  topic: "SHOP_REDACT",
  shop: "polished-holistic.myshopify.com",
  payload: {},
}));

vi.mock("../app/lib/webhook-auth.server", () => ({
  get authenticateWebhookTolerant() {
    return authenticateWebhookTolerant;
  },
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: { webhook: vi.fn() },
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
}));

const originalSecret = process.env.SHOPIFY_API_SECRET;

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET;
  supabaseFrom.mockClear();
  authenticateWebhookTolerant.mockClear();
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SHOPIFY_API_SECRET;
  else process.env.SHOPIFY_API_SECRET = originalSecret;
});

const post = (topic, body, hmac) =>
  new Request("https://example.com/webhooks/compliance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": "polished-holistic.myshopify.com",
    },
    body,
  });

const BODY = JSON.stringify({ shop_id: 3035889, customer: { id: 191167 } });

describe("compliance webhook route", () => {
  for (const topic of ["customers/redact", "customers/data_request"]) {
    it(`answers a signed ${topic} with 200 and no database work`, async () => {
      const { action } = await import("../app/routes/webhooks.compliance");
      const response = await action({ request: post(topic, BODY, sign(BODY)) });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      // The two things that made the burst time out.
      expect(supabaseFrom).not.toHaveBeenCalled();
      expect(authenticateWebhookTolerant).not.toHaveBeenCalled();
    });
  }

  it("falls back to the library when the signature does not verify", async () => {
    const { action } = await import("../app/routes/webhooks.compliance");
    authenticateWebhookTolerant.mockResolvedValueOnce({
      topic: "CUSTOMERS_REDACT",
      shop: "polished-holistic.myshopify.com",
      payload: {},
    });

    const response = await action({ request: post("customers/redact", BODY, "bogus") });

    expect(response.status).toBe(200);
    // Authentication is still enforced, just by the library rather than us.
    expect(authenticateWebhookTolerant).toHaveBeenCalledTimes(1);
  });

  it("still runs the cascade delete for shop/redact", async () => {
    const { action } = await import("../app/routes/webhooks.compliance");
    supabaseFrom.mockImplementationOnce(() => {
      const chain = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.single = async () => ({ data: { id: "shop-uuid-1" }, error: null });
      return chain;
    });

    const response = await action({ request: post("shop/redact", BODY, sign(BODY)) });

    expect(response.status).toBe(200);
    expect(authenticateWebhookTolerant).toHaveBeenCalledTimes(1);
    // The lookup plus the erase of every shop-scoped table.
    const tables = supabaseFrom.mock.calls.map(([t]) => t);
    expect(tables).toContain("shops");
    expect(tables).toContain("messages");
    expect(tables).toContain("meta_auth");
  });

  it("rejects a GET with 405 rather than rendering", async () => {
    const { loader } = await import("../app/routes/webhooks.compliance");
    expect(loader().status).toBe(405);
  });
});
