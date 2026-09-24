import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION_WINDOW_DAYS,
  appendAttributionParams,
  extractLinkIdFromRef,
  lastClickCookieHeader,
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

describe("lastClickCookieHeader", () => {
  it("sets a 30-day first-party cookie", () => {
    expect(lastClickCookieHeader("info_abc123def456")).toBe(
      "sr_ref=link_info_abc123def456; Max-Age=2592000; Path=/; SameSite=Lax",
    );
  });

  it("rejects an unsafe id", () => {
    expect(lastClickCookieHeader("bad id")).toBeNull();
  });
});
