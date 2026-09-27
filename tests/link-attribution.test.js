import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION_WINDOW_DAYS,
  appendAttributionParams,
  chooseAttributionSource,
  extractLinkIdFromRef,
  publicStoreHost,
  rewriteMyshopifyHost,
  shouldCreditLink,
} from "../app/lib/link-attribution";

describe("appendAttributionParams", () => {
  it("stamps ref and UTMs on a homepage without a cart attribute", () => {
    const url = appendAttributionParams("https://lovebyluna.co/", "info_abc123def456", {
      campaign: "ig_browse",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ref")).toBe("link_info_abc123def456");
    expect(parsed.searchParams.get("utm_source")).toBe("instagram");
    expect(parsed.searchParams.get("utm_medium")).toBe("ig_dm");
    expect(parsed.searchParams.get("utm_campaign")).toBe("ig_browse");
    expect(parsed.searchParams.get("attributes[ref]")).toBeNull();
  });

  it("stamps a collection URL the same way", () => {
    const url = appendAttributionParams(
      "https://lovebyluna.co/collections/nail-polish",
      "info_deadbeef0123",
      { campaign: "ig_browse" },
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/collections/nail-polish");
    expect(parsed.searchParams.get("ref")).toBe("link_info_deadbeef0123");
  });

  it("adds cart attributes only on checkout permalinks", () => {
    const url = appendAttributionParams("https://store.myshopify.com/cart/1:1", "TeuHqkwt", {
      cartAttribute: true,
      campaign: "dm_to_buy",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ref")).toBe("link_TeuHqkwt");
    expect(parsed.searchParams.get("attributes[ref]")).toBe("link_TeuHqkwt");
    expect(parsed.searchParams.get("utm_campaign")).toBe("dm_to_buy");
  });

  it("does not overwrite an existing ref", () => {
    const url = appendAttributionParams("https://lovebyluna.co/?ref=keep", "newid");
    expect(new URL(url).searchParams.get("ref")).toBe("keep");
  });
});

describe("extractLinkIdFromRef", () => {
  it("reads checkout, browse, and PDP ids", () => {
    expect(extractLinkIdFromRef("link_TeuHqkwt")).toBe("TeuHqkwt");
    expect(extractLinkIdFromRef("link_info_abc123def456")).toBe("info_abc123def456");
    expect(extractLinkIdFromRef("link_pdp_lengS5Ka")).toBe("pdp_lengS5Ka");
  });

  it("rejects values that are not ours", () => {
    expect(extractLinkIdFromRef("not-ours")).toBeNull();
    expect(extractLinkIdFromRef("")).toBeNull();
    expect(extractLinkIdFromRef(null)).toBeNull();
  });
});

describe("30-day last-click window", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");

  it("is 30 days", () => {
    expect(ATTRIBUTION_WINDOW_DAYS).toBe(30);
  });

  it("credits a click from 29 days ago", () => {
    expect(
      shouldCreditLink({
        lastTouchAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(),
        now,
      }),
    ).toBe(true);
  });

  it("rejects a click from 31 days ago", () => {
    expect(
      shouldCreditLink({
        lastTouchAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
        now,
      }),
    ).toBe(false);
  });

  it("credits a discount code even after the window", () => {
    expect(
      shouldCreditLink({
        lastTouchAt: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
        fromDiscountCode: true,
        now,
      }),
    ).toBe(true);
  });

  it("rejects a missing last touch unless it is a discount code", () => {
    expect(shouldCreditLink({ lastTouchAt: null, now })).toBe(false);
    expect(shouldCreditLink({ lastTouchAt: null, fromDiscountCode: true, now })).toBe(true);
  });
});

describe("rewriteMyshopifyHost", () => {
  it("sends an old myshopify checkout link to the public domain", () => {
    const url = rewriteMyshopifyHost(
      "https://lovebyluna.myshopify.com/cart/42167057225:1?ref=link_L94zyvil&attributes%5Bref%5D=link_L94zyvil",
      "lovebyluna.co",
    );
    const parsed = new URL(url);
    expect(parsed.host).toBe("lovebyluna.co");
    expect(parsed.pathname).toBe("/cart/42167057225:1");
    expect(parsed.searchParams.get("ref")).toBe("link_L94zyvil");
    expect(parsed.searchParams.get("attributes[ref]")).toBe("link_L94zyvil");
  });

  it("leaves a url that is already on the public domain", () => {
    const url = "https://lovebyluna.co/collections/nail-polish?ref=link_info_abc123def456";
    expect(rewriteMyshopifyHost(url, "lovebyluna.co")).toBe(url);
  });
});

describe("publicStoreHost", () => {
  it("reads the custom domain and ignores myshopify", () => {
    expect(publicStoreHost({ primaryDomain: { host: "LoveByLuna.co" } })).toBe("lovebyluna.co");
    expect(publicStoreHost({ primaryDomain: { host: "lovebyluna.myshopify.com" } })).toBeNull();
    expect(publicStoreHost(null)).toBeNull();
  });
});

describe("chooseAttributionSource", () => {
  it("lets the cart stamp beat an older discount code", () => {
    expect(chooseAttributionSource({
      cartLinkId: "info_abc123def456",
      discountLinkId: "TeuHqkwt",
      cartInWindow: true,
      landingInWindow: false,
    })).toEqual({ linkId: "info_abc123def456", source: "cart" });
  });

  it("uses the landing ref when the cart stamp is missing", () => {
    expect(chooseAttributionSource({
      landingLinkId: "info_abc123def456",
      landingInWindow: true,
    })).toEqual({ linkId: "info_abc123def456", source: "landing" });
  });

  it("falls through to the discount code when the click is outside the window", () => {
    expect(chooseAttributionSource({
      cartLinkId: "TeuHqkwt",
      discountLinkId: "TeuHqkwt",
      cartInWindow: false,
      landingInWindow: false,
    })).toEqual({ linkId: "TeuHqkwt", source: "discount" });
  });

  it("credits nothing when every signal is empty", () => {
    expect(chooseAttributionSource({})).toEqual({ linkId: null, source: null });
  });
});
