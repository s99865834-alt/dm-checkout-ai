/**
 * The plan screen names a first charge date only when Shopify is sure to give
 * the full trial: a first install that has never had a subscription. Shopify
 * keeps used trial days for 180 days and won't say how many are left, so
 * everyone else is told Shopify shows their date.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getShopWithPlan = vi.fn();
const getCurrentSubscription = vi.fn();

vi.mock("../app/lib/loader-helpers.server", () => ({ getShopWithPlan: (...a) => getShopWithPlan(...a) }));
vi.mock("../app/lib/billing.server", () => ({
  getCurrentSubscription: (...a) => getCurrentSubscription(...a),
  getTrialStatus: (sub) => (sub ? { daysLeft: 3 } : null),
}));
vi.mock("../app/lib/loader-cache.server", () => ({ cached: (_key, _ttl, fn) => fn() }));
vi.mock("@shopify/shopify-app-react-router/server", () => ({ boundary: { headers: () => ({}), error: () => null } }));

const USD_48 = { amount: "48.0", currencyCode: "USD" };

function adminWith({ history = [], historyFails = false } = {}) {
  return {
    graphql: vi.fn(async (query) => {
      if (query.includes("PlanTrialHistory")) {
        if (historyFails) throw new Error("Throttled");
        return { json: async () => ({ data: { currentAppInstallation: { allSubscriptions: { nodes: history } } } }) };
      }
      return {
        json: async () => ({
          data: { products: { nodes: [{ priceRangeV2: { minVariantPrice: USD_48, maxVariantPrice: USD_48 } }] } },
        }),
      };
    }),
  };
}

const askedForHistory = (admin) => admin.graphql.mock.calls.some(([q]) => q.includes("PlanTrialHistory"));

function shopRow(overrides = {}) {
  return {
    id: "shop-1",
    shopify_domain: "your-store.myshopify.com",
    created_at: "2026-11-25T10:00:00Z",
    installed_at: "2026-11-25T10:00:04Z",
    store_context_json: {
      products: [{ title: "Linen Wrap Dress", handle: "linen-wrap-dress" }],
      primaryDomain: { host: "your-store.com" },
    },
    ...overrides,
  };
}

async function load({ shop = shopRow(), plan = { name: "FREE" }, admin = adminWith() } = {}) {
  getShopWithPlan.mockResolvedValueOnce({ shop, plan, admin });
  const { loader } = await import("../app/routes/app.billing.select");
  return loader({ request: new Request("https://example.com/app/billing/select") });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  getShopWithPlan.mockReset();
  getCurrentSubscription.mockReset();
  getCurrentSubscription.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("plan screen trial promise", () => {
  it("gives a first install that never subscribed a date and its own product", async () => {
    const data = await load();
    expect(data.choosingFirstPlan).toBe(true);
    expect(data.firstChargeOn).toBe("December 9");
    expect(data.example).toEqual({ title: "Linen Wrap Dress", domain: "your-store.com", price: "$48.00", from: false });
  });

  it("gives no date once the store has had a subscription, even a cancelled one", async () => {
    const data = await load({ admin: adminWith({ history: [{ id: "gid://shopify/AppSubscription/1" }] }) });
    expect(data.choosingFirstPlan).toBe(true);
    expect(data.firstChargeOn).toBeNull();
  });

  it("gives no date on a reinstall, without asking Shopify", async () => {
    const admin = adminWith();
    const data = await load({ shop: shopRow({ installed_at: "2026-11-28T09:00:00Z" }), admin });
    expect(data.firstChargeOn).toBeNull();
    expect(askedForHistory(admin)).toBe(false);
  });

  it("gives no date when the history can't be read", async () => {
    const data = await load({ admin: adminWith({ historyFails: true }) });
    expect(data.firstChargeOn).toBeNull();
    expect(data.example?.title).toBe("Linen Wrap Dress");
  });

  it("shows a store that already pays none of it", async () => {
    getCurrentSubscription.mockResolvedValue({ status: "ACTIVE", trialDays: 14 });
    const admin = adminWith();
    const data = await load({ plan: { name: "GROWTH" }, admin });
    expect(data.choosingFirstPlan).toBe(false);
    expect(data.firstChargeOn).toBeNull();
    expect(data.example).toBeNull();
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});
