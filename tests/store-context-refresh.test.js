/**
 * The cached store context refreshes itself once it goes stale.
 *
 * Before this, the cache was only written by the app's page loaders, so a
 * merchant who never opened the app never got a refresh. On 2 Sep 2026 Mark
 * Watts Studios was answering store questions from a 34-day-old snapshot.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../app/lib/db.server", () => ({
  getStoredStoreContextWithAge: vi.fn(),
  saveStoredStoreContext: vi.fn(async () => {}),
}));

vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyStoreInfo: vi.fn(),
}));

vi.mock("../app/lib/logger.server", () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { getStoreContextForReply, resetStoreContextRefreshState } = await import(
  "../app/lib/store-context.server"
);
const { getStoredStoreContextWithAge, saveStoredStoreContext } = await import(
  "../app/lib/db.server"
);
const { getShopifyStoreInfo } = await import("../app/lib/shopify-data.server");

const shop = { id: "shop-1", shopify_domain: "test-store.myshopify.com" };
const CACHED = { name: "Test Store", email: "owner@test.com" };
const FRESH = { name: "Test Store", email: "new-owner@test.com" };

/** Let the un-awaited refresh run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  resetStoreContextRefreshState();
  getShopifyStoreInfo.mockResolvedValue(FRESH);
});

describe("getStoreContextForReply", () => {
  it("answers from the cache and refreshes when it's stale", async () => {
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: true });

    // The reply must not wait on Shopify, so it gets the old value now...
    const context = await getStoreContextForReply(shop);
    expect(context).toBe(CACHED);

    // ...and the next reply gets a fresh one.
    await settle();
    expect(getShopifyStoreInfo).toHaveBeenCalledWith(shop.shopify_domain);
    expect(saveStoredStoreContext).toHaveBeenCalledWith(shop.id, FRESH);
  });

  it("does not refresh while the cache is fresh", async () => {
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: false });

    const context = await getStoreContextForReply(shop);
    await settle();

    expect(context).toBe(CACHED);
    expect(getShopifyStoreInfo).not.toHaveBeenCalled();
  });

  it("refreshes when there is no cache at all", async () => {
    getStoredStoreContextWithAge.mockResolvedValue({ context: null, stale: false });

    const context = await getStoreContextForReply(shop);
    await settle();

    expect(context).toBeNull();
    expect(getShopifyStoreInfo).toHaveBeenCalled();
  });

  it("refreshes once for a burst of messages, not once per message", async () => {
    // A viral post delivers dozens of webhooks a minute; each one must not
    // start its own Admin API call.
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: true });
    let release;
    getShopifyStoreInfo.mockReturnValue(new Promise((r) => { release = r; }));

    await Promise.all([
      getStoreContextForReply(shop),
      getStoreContextForReply(shop),
      getStoreContextForReply(shop),
    ]);
    await settle();

    expect(getShopifyStoreInfo).toHaveBeenCalledTimes(1);

    release(FRESH);
    await settle();
  });

  it("allows a later refresh once the first has finished", async () => {
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: true });

    await getStoreContextForReply(shop);
    await settle();
    await getStoreContextForReply(shop);
    await settle();

    expect(getShopifyStoreInfo).toHaveBeenCalledTimes(2);
  });

  it("keeps the old cache when the refresh returns nothing", async () => {
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: true });
    getShopifyStoreInfo.mockResolvedValue(null);

    await getStoreContextForReply(shop);
    await settle();

    expect(saveStoredStoreContext).not.toHaveBeenCalled();
  });

  it("survives a refresh that throws", async () => {
    // An unhandled rejection here would take down the worker over a cache
    // refresh the reply never depended on.
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: true });
    getShopifyStoreInfo.mockRejectedValue(new Error("401 Unauthorized"));

    const context = await getStoreContextForReply(shop);
    await settle();

    expect(context).toBe(CACHED);
    expect(saveStoredStoreContext).not.toHaveBeenCalled();
  });

  it("retries after a failed refresh rather than latching", async () => {
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: true });
    getShopifyStoreInfo.mockRejectedValueOnce(new Error("timeout"));

    await getStoreContextForReply(shop);
    await settle();
    await getStoreContextForReply(shop);
    await settle();

    expect(saveStoredStoreContext).toHaveBeenCalledWith(shop.id, FRESH);
  });

  it("does not try to refresh a shop with no domain", async () => {
    getStoredStoreContextWithAge.mockResolvedValue({ context: CACHED, stale: true });

    await getStoreContextForReply({ id: "shop-2" });
    await settle();

    expect(getShopifyStoreInfo).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}])("returns null for %s", async (badShop) => {
    const context = await getStoreContextForReply(badShop);
    expect(context).toBeNull();
    expect(getStoredStoreContextWithAge).not.toHaveBeenCalled();
  });
});
