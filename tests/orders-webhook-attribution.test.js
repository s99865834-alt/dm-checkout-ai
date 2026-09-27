/**
 * The orders/create handler itself, which had no test at all.
 *
 * Everything around it was covered (the pure window helper, the cookie, the
 * link builders) while the code that actually decides whether a merchant sees
 * revenue was only ever exercised in production. These tests pin the
 * precedence between the four signals and the 30-day window.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  shop: { id: "shop-1", shopify_domain: "lovebyluna.myshopify.com" },
  payload: {},
  lastTouchAt: new Date().toISOString(),
  discountLookup: null,
  attributions: [],
  sightings: [],
}));

vi.mock("../app/shopify.server", () => ({
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
  authenticate: {
    webhook: async () => ({ shop: state.shop.shopify_domain, payload: state.payload }),
  },
}));

vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
}));

vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyProductContextForReply: vi.fn(async () => null),
  getShopPrimaryDomainHost: vi.fn(async () => null),
}));

vi.mock("../app/lib/discount-pool.server", () => ({
  claimDiscountCode: vi.fn(async () => null),
  findLinkIdForDiscountCodes: vi.fn(async () => state.discountLookup),
}));

vi.mock("../app/lib/db.server", () => ({
  getShopByDomain: vi.fn(async () => state.shop),
  getLinkLastTouchAt: vi.fn(async () => state.lastTouchAt),
  recordAttribution: vi.fn(async (row) => {
    state.attributions.push(row);
  }),
  recordOrderSighting: vi.fn(async (row) => {
    state.sightings.push(row);
  }),
}));

const { action } = await import("../app/routes/webhooks.shopify.orders");

const OUTSIDE_WINDOW = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

function request() {
  return new Request("https://app.example.com/webhooks/shopify/orders", { method: "POST" });
}

async function handle(payload, { lastTouchAt, discountLookup = null } = {}) {
  state.payload = { id: 900, total_price: "50.00", currency: "USD", ...payload };
  if (lastTouchAt !== undefined) state.lastTouchAt = lastTouchAt;
  state.discountLookup = discountLookup;
  const res = await action({ request: request() });
  return { res, attribution: state.attributions[0] || null, sighting: state.sightings[0] || null };
}

beforeEach(() => {
  state.attributions = [];
  state.sightings = [];
  state.lastTouchAt = new Date().toISOString();
  state.discountLookup = null;
});

describe("orders/create attribution precedence", () => {
  it("credits the cart attribute, which is the last click we stamped", async () => {
    const { attribution, sighting } = await handle({
      note_attributes: [{ name: "ref", value: "link_info_abc123def456" }],
    });
    expect(attribution).toMatchObject({ linkId: "info_abc123def456", amount: 50 });
    expect(sighting).toMatchObject({ attributed: true, hadCartRef: true });
  });

  it("credits the ref on landing_site when the cart was never stamped", async () => {
    const { attribution, sighting } = await handle({
      landing_site: "/collections/all?ref=link_info_abc123def456&utm_source=instagram&utm_medium=ig_dm",
    });
    expect(attribution).toMatchObject({ linkId: "info_abc123def456", channel: "dm" });
    expect(sighting).toMatchObject({ attributed: true, hadLandingRef: true, hadCartRef: false });
  });

  // Shopify files the ref query param on its own field, which the handler
  // used to ignore entirely, so a same-session purchase could arrive with the
  // link id present and go uncredited.
  it("credits landing_site_ref when the landing url itself has no query", async () => {
    const { attribution } = await handle({
      landing_site: "/cart/123:1",
      landing_site_ref: "link_TeuHqkwt",
    });
    expect(attribution).toMatchObject({ linkId: "TeuHqkwt" });
  });

  it("ignores a landing_site_ref that is not one of ours", async () => {
    const { attribution, sighting } = await handle({
      landing_site: "/?utm_source=attentive",
      landing_site_ref: "attentive",
    });
    expect(attribution).toBeNull();
    expect(sighting).toMatchObject({ attributed: false, utmSource: "attentive" });
  });

  // A code lives on the order forever, so an old one must not outrank the
  // click that actually drove this purchase.
  it("lets a fresh cart stamp beat an older discount code", async () => {
    const { attribution } = await handle(
      {
        note_attributes: [{ name: "ref", value: "link_info_abc123def456" }],
        discount_codes: [{ code: "SRABCDEFGHJK" }],
      },
      { discountLookup: "TeuHqkwt" },
    );
    expect(attribution).toMatchObject({ linkId: "info_abc123def456" });
  });

  it("falls back to the discount code when nothing else carries a link", async () => {
    const { attribution, sighting } = await handle(
      { discount_codes: [{ code: "SRABCDEFGHJK" }] },
      { discountLookup: "TeuHqkwt" },
    );
    expect(attribution).toMatchObject({ linkId: "TeuHqkwt" });
    expect(sighting).toMatchObject({ attributed: true, hadDiscountCode: true });
  });

  it("credits a discount code even outside the 30-day window", async () => {
    const { attribution } = await handle(
      { discount_codes: [{ code: "SRABCDEFGHJK" }] },
      { lastTouchAt: OUTSIDE_WINDOW, discountLookup: "TeuHqkwt" },
    );
    expect(attribution).toMatchObject({ linkId: "TeuHqkwt" });
  });

  it("refuses a cart stamp from a link last touched over 30 days ago", async () => {
    const { attribution, sighting } = await handle(
      { note_attributes: [{ name: "ref", value: "link_info_abc123def456" }] },
      { lastTouchAt: OUTSIDE_WINDOW },
    );
    expect(attribution).toBeNull();
    expect(sighting).toMatchObject({ attributed: false, hadCartRef: true });
  });

  it("records an uncredited sighting rather than staying silent", async () => {
    const { res, attribution, sighting } = await handle({ landing_site: "/", total_price: "80.96" });
    expect(attribution).toBeNull();
    expect(sighting).toMatchObject({ attributed: false, amount: 80.96, landingIsCart: false });
    expect(res.status).toBe(200);
  });

  it("does not treat another app's discount code as ours", async () => {
    const { sighting } = await handle({ discount_codes: [{ code: "WELCOME10" }] });
    expect(sighting).toMatchObject({ hadDiscountCode: false, attributed: false });
  });
});
