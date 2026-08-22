/**
 * Attribution plumbing tests: the checkout link must carry the attribution
 * markers, and the webhook-side extractor must read them back from the order.
 * Cart attributes (attributes[ref]) are the cross-session path: they persist
 * on the Shopify cart and arrive in the order's note_attributes even when the
 * customer buys hours or days after clicking.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

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
