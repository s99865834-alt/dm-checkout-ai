/**
 * A forged orders/create delivery has to be rejected with the status the
 * Shopify library chose, not swallowed into a 500.
 *
 * 21 Oct 2026: an unsigned POST to this route answered 500. Shopify reads 5xx
 * as a transient failure and retries, so bot traffic to the public webhook URL
 * was generating retry storms and counting against the app's delivery record.
 * The sibling routes already re-throw Response errors; this one did not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateWebhook = vi.fn();

vi.mock("../app/shopify.server", () => ({
  authenticate: {
    get webhook() {
      return authenticateWebhook;
    },
  },
  default: { clients: {} },
}));

const getShopByDomain = vi.fn(async () => null);

vi.mock("../app/lib/db.server", () => ({
  getShopByDomain: (...a) => getShopByDomain(...a),
  getLinkLastTouchAt: async () => null,
  recordAttribution: async () => ({}),
  recordOrderSighting: async () => ({}),
}));

vi.mock("../app/lib/links.server", () => ({
  extractLinkIdFromNoteAttributes: () => null,
}));

vi.mock("../app/lib/link-attribution", () => ({
  extractLinkIdFromRef: () => null,
  shouldCreditLink: () => false,
  chooseAttributionSource: () => null,
}));

vi.mock("../app/lib/discount-rules", () => ({
  looksLikeOurDiscountCode: () => false,
}));

vi.mock("../app/lib/discount-pool.server", () => ({
  findLinkIdForDiscountCodes: async () => null,
}));

vi.mock("../app/lib/logger.server", () => ({
  default: { debug: () => {}, warn: () => {}, error: () => {} },
}));

const post = () =>
  new Request("https://example.com/webhooks/shopify/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1234, total_price: "10.00" }),
  });

beforeEach(() => {
  authenticateWebhook.mockReset();
  getShopByDomain.mockClear();
});

describe("orders webhook route", () => {
  it("passes the library's rejection through instead of returning 500", async () => {
    authenticateWebhook.mockRejectedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const { action } = await import("../app/routes/webhooks.shopify.orders");

    // The route re-throws, so the framework serves the 401 unchanged.
    const thrown = await action({ request: post() }).catch((e) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(401);
    // A forged delivery must never reach the database.
    expect(getShopByDomain).not.toHaveBeenCalled();
  });

  it("still returns 500 for a genuine processing failure", async () => {
    authenticateWebhook.mockRejectedValueOnce(new Error("socket hang up"));

    const { action } = await import("../app/routes/webhooks.shopify.orders");
    const response = await action({ request: post() });

    expect(response.status).toBe(500);
  });

  it("rejects a GET with 405 rather than rendering", async () => {
    const { loader } = await import("../app/routes/webhooks.shopify.orders");
    expect(loader().status).toBe(405);
  });
});
