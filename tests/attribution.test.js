/**
 * Attribution plumbing tests: the checkout link must carry the attribution
 * markers, and the webhook-side extractor must read them back from the order.
 * Cart attributes (attributes[ref]) are the cross-session path: they persist
 * on the Shopify cart and arrive in the order's note_attributes even when the
 * customer buys hours or days after clicking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// buildCheckoutLink writes, resolveTrackedLink reads. One fake covers both.
const fake = vi.hoisted(() => ({ linkRow: { url: "https://store.example.com/products/x" } }));

vi.mock("../app/lib/supabase.server", () => ({
  default: {
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: fake.linkRow, error: null }) }),
      }),
    }),
  },
}));

vi.mock("../app/lib/db.server", () => ({ logClick: vi.fn(async () => {}) }));

vi.mock("../app/shopify.server", () => ({
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
}));

vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyProductContextForReply: vi.fn(async () => null),
  getShopPrimaryDomainHost: vi.fn(async () => null),
}));

import { buildCheckoutLink, extractLinkIdFromNoteAttributes } from "../app/lib/links.server";
import { isCheckoutLinkId } from "../app/lib/checkout-link-id";
import { resolveTrackedLink } from "../app/lib/click-redirect.server";
import { logClick } from "../app/lib/db.server";

const shop = { id: "shop-1", shopify_domain: "test-store.myshopify.com" };

describe("checkout link attribution markers", () => {
  it("carries ref, cart attribute, and UTMs", async () => {
    const { url, linkId } = await buildCheckoutLink(
      shop,
      "gid://shopify/Product/123",
      "gid://shopify/ProductVariant/456",
      1
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ref")).toBe(`link_${linkId}`);
    expect(parsed.searchParams.get("attributes[ref]")).toBe(`link_${linkId}`);
    expect(parsed.searchParams.get("utm_source")).toBe("instagram");
    expect(parsed.pathname).toBe("/cart/456:1");
  });
});

describe("extractLinkIdFromNoteAttributes", () => {
  it("reads the link id from order note_attributes", () => {
    const attrs = [
      { name: "something_else", value: "x" },
      { name: "ref", value: "link_mEs7Sicv" },
    ];
    expect(extractLinkIdFromNoteAttributes(attrs)).toBe("mEs7Sicv");
  });

  it("returns null for orders without our attribute", () => {
    expect(extractLinkIdFromNoteAttributes([])).toBeNull();
    expect(extractLinkIdFromNoteAttributes(undefined)).toBeNull();
    expect(extractLinkIdFromNoteAttributes([{ name: "ref", value: "not-ours" }])).toBeNull();
  });
});

// info_ clicks used to be skipped as "housekeeping", which meant the one link
// type we send in volume was the one we knew nothing about: an unmapped post
// can only ever answer with an info_ link. Logging them costs no KPI accuracy,
// since getAnalytics filters to isCheckoutLinkId before counting anything.
describe("click logging by link type", () => {
  const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

  function request(userAgent) {
    return new Request("https://store.example.com/a/go/x", {
      headers: userAgent ? { "user-agent": userAgent } : {},
    });
  }

  beforeEach(() => {
    logClick.mockClear();
    fake.linkRow = { url: "https://store.example.com/products/x" };
  });

  for (const linkId of ["info_236a994b49a0", "pdp_lengS5Ka", "mEs7Sicv"]) {
    it(`logs a browser click on ${linkId}`, async () => {
      const url = await resolveTrackedLink(linkId, request(BROWSER_UA));
      expect(url).toBe("https://store.example.com/products/x");
      expect(logClick).toHaveBeenCalledTimes(1);
      expect(logClick.mock.calls[0][0].linkId).toBe(linkId);
    });
  }

  // Instagram fetches a preview the instant a DM is delivered. Counting that
  // as a click would report engagement nobody had.
  it("ignores link-preview crawlers", async () => {
    await resolveTrackedLink("info_236a994b49a0", request("facebookexternalhit/1.1"));
    expect(logClick).not.toHaveBeenCalled();
  });

  it("ignores requests with no user agent", async () => {
    await resolveTrackedLink("info_236a994b49a0", request(null));
    expect(logClick).not.toHaveBeenCalled();
  });

  it("still redirects when click logging throws", async () => {
    logClick.mockRejectedValueOnce(new Error("db down"));
    const url = await resolveTrackedLink("info_236a994b49a0", request(BROWSER_UA));
    expect(url).toBe("https://store.example.com/products/x");
  });
});

describe("isCheckoutLinkId", () => {
  it("accepts bare 8-char checkout ids", () => {
    expect(isCheckoutLinkId("TeuHqkwt")).toBe(true);
    expect(isCheckoutLinkId("mEs7Sicv")).toBe(true);
  });

  it("rejects bookkeeping and non-checkout prefixes", () => {
    expect(isCheckoutLinkId("dm_reply_comment_123")).toBe(false);
    expect(isCheckoutLinkId("info_a2f4882e9481")).toBe(false);
    expect(isCheckoutLinkId("pdp_lengS5Ka")).toBe(false);
    expect(isCheckoutLinkId("followup_abc")).toBe(false);
    expect(isCheckoutLinkId("size_q_xyz")).toBe(false);
    expect(isCheckoutLinkId(null)).toBe(false);
  });
});
