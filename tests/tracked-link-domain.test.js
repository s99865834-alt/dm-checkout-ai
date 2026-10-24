/**
 * Which domain a customer sees in a DM.
 *
 * It must always be the merchant's own store. Until 24 Oct 2026 a shop with no
 * custom domain fell back to the shared short-link domain, so 21 of 38 shops
 * sent links on socialrepl.ai, a domain their customers had never heard of.
 * A *.myshopify.com host is still visibly the merchant's store, Shopify mounts
 * the app proxy on it, and it always has valid SSL, so there was never a reason
 * to prefer ours.
 *
 * click-redirect.server.js already resolved the host this way
 * (`storefrontHost: publicHost || shop.shopify_domain`), which is what made
 * those shops' clicks attributable; only the link shown in the DM disagreed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getShopPrimaryDomainHost = vi.fn();

// shopify.server calls shopifyApp() at module scope, which throws on an empty
// appUrl. Locally .env supplies one, so a missing mock here passes and then
// fails in CI, where there is no .env.
vi.mock("../app/shopify.server", () => ({
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
}));

vi.mock("../app/lib/shopify-data.server", () => ({
  getShopPrimaryDomainHost: (...a) => getShopPrimaryDomainHost(...a),
  getShopifyProductContextForReply: vi.fn(),
}));

vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock("../app/lib/logger.server", () => ({
  default: { debug: () => {}, warn: () => {}, error: () => {} },
}));

const SHOP = { id: "shop-1", shopify_domain: "donna-henry.myshopify.com" };

beforeEach(() => {
  getShopPrimaryDomainHost.mockReset();
});

describe("getTrackedLinkUrl", () => {
  it("uses the custom domain when the store has one", async () => {
    getShopPrimaryDomainHost.mockResolvedValue("donnahenry.co.uk");
    const { getTrackedLinkUrl } = await import("../app/lib/links.server");

    expect(await getTrackedLinkUrl(SHOP, "AbCdEf12")).toBe(
      "https://donnahenry.co.uk/a/go/AbCdEf12",
    );
  });

  it("uses the shop's own myshopify host when there is no custom domain", async () => {
    // Previously this returned the shared short-link domain.
    getShopPrimaryDomainHost.mockResolvedValue(null);
    const { getTrackedLinkUrl } = await import("../app/lib/links.server");

    const url = await getTrackedLinkUrl(SHOP, "AbCdEf12");

    expect(url).toBe("https://donna-henry.myshopify.com/a/go/AbCdEf12");
    expect(url).not.toContain("socialrepl.ai");
  });

  it("never puts our own domain in front of a customer when a shop domain exists", async () => {
    getShopPrimaryDomainHost.mockResolvedValue(null);
    const { getTrackedLinkUrl } = await import("../app/lib/links.server");

    for (const domain of ["a.myshopify.com", "store-with-dashes.myshopify.com"]) {
      const url = await getTrackedLinkUrl({ id: "s", shopify_domain: domain }, "AbCdEf12");
      expect(url).toBe(`https://${domain}/a/go/AbCdEf12`);
    }
  });

  it("falls back to the short-link domain only when there is no shop domain at all", async () => {
    const { getTrackedLinkUrl, getClickTrackingUrlForMessage } = await import(
      "../app/lib/links.server"
    );

    expect(await getTrackedLinkUrl(null, "AbCdEf12")).toBe(
      getClickTrackingUrlForMessage("AbCdEf12"),
    );
    expect(await getTrackedLinkUrl({ id: "s" }, "AbCdEf12")).toBe(
      getClickTrackingUrlForMessage("AbCdEf12"),
    );
    // And it does not call Shopify when there is nothing to look up.
    expect(getShopPrimaryDomainHost).not.toHaveBeenCalled();
  });
});
