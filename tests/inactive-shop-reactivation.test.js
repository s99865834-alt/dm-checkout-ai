/**
 * A page load must never downgrade a merchant.
 *
 * getShopWithPlan runs on every navigation, and for a shop whose row was
 * inactive it used to call createOrUpdateShop, the reinstall primitive. That
 * forces plan to FREE and zeroes usage_count, so a paying merchant whose row
 * went inactive for any reason lost their plan and their usage counter by
 * opening a page. Reactivating still has to happen, because webhooks.meta
 * drops Instagram DMs for an inactive shop, but it has to be the only thing
 * that happens. The plan reset a genuine reinstall needs lives in afterAuth.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  updates: [],
  row: null,
}));

vi.mock("../app/lib/supabase.server", () => {
  function chain(table) {
    const c = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.update = (patch) => {
      state.updates.push({ table, patch });
      return {
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: { ...state.row, ...patch },
              error: null,
            }),
          }),
        }),
      };
    };
    c.single = async () => ({ data: state.row, error: null });
    c.maybeSingle = async () => ({ data: state.row, error: null });
    return c;
  }
  return { default: { from: (t) => chain(t) } };
});

const { reactivateShop } = await import("../app/lib/db.server");

beforeEach(() => {
  state.updates = [];
  state.row = {
    shopify_domain: "paying-shop.myshopify.com",
    plan: "PRO",
    monthly_cap: 10000,
    usage_count: 4210,
    active: false,
  };
});

describe("reactivateShop", () => {
  it("turns active back on", async () => {
    const result = await reactivateShop("paying-shop.myshopify.com");
    expect(result.active).toBe(true);
  });

  it("writes only the active column", async () => {
    await reactivateShop("paying-shop.myshopify.com");
    expect(state.updates).toHaveLength(1);
    expect(Object.keys(state.updates[0].patch)).toEqual(["active"]);
  });

  it("leaves a paid plan and its usage counter alone", async () => {
    const result = await reactivateShop("paying-shop.myshopify.com");
    expect(result.plan).toBe("PRO");
    expect(result.monthly_cap).toBe(10000);
    expect(result.usage_count).toBe(4210);

    const patch = state.updates[0].patch;
    expect(patch).not.toHaveProperty("plan");
    expect(patch).not.toHaveProperty("usage_count");
    expect(patch).not.toHaveProperty("monthly_cap");
    expect(patch).not.toHaveProperty("priority_support");
  });
});
