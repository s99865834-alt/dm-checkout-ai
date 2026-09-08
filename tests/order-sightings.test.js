/**
 * Recording every order we're told about, so attribution is falsifiable.
 *
 * The orders/create handler wrote a row when it found a link id and stored
 * nothing otherwise. On 8 Sep 2026 that left 108 checkout links, 19 verified
 * human clicks and zero attributed orders with no way to tell whether nobody
 * bought or the ref was being lost before checkout.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let upserted = [];
let selectResult = { data: [], error: null };
let upsertError = null;

vi.mock("../app/lib/supabase.server", () => {
  function chain(table) {
    const c = {};
    for (const m of ["select", "eq", "gte", "lte", "like", "is", "in", "order", "limit"]) {
      c[m] = () => c;
    }
    c.upsert = (row) => {
      upserted.push({ table, row });
      return { then: (res, rej) => Promise.resolve({ error: upsertError }).then(res, rej) };
    };
    c.then = (res, rej) => Promise.resolve(selectResult).then(res, rej);
    return c;
  }
  return { default: { from: (t) => chain(t), rpc: async () => ({ data: null, error: null }) } };
});

const { recordOrderSighting, getOrderSightingsByShop } = await import("../app/lib/db.server");

const SHOP = "shop-1";

beforeEach(() => {
  upserted = [];
  upsertError = null;
  selectResult = { data: [], error: null };
});

describe("recordOrderSighting", () => {
  it("records an order it could credit", async () => {
    await recordOrderSighting({
      shopId: SHOP,
      orderId: "7837479698537",
      attributed: true,
      amount: "25.48",
      currency: "USD",
      hadCartRef: true,
    });

    expect(upserted).toHaveLength(1);
    expect(upserted[0].row).toMatchObject({
      shop_id: SHOP,
      order_id: "7837479698537",
      attributed: true,
      had_cart_ref: true,
      had_landing_ref: false,
    });
  });

  it("records an order it could not credit, which is the whole point", async () => {
    await recordOrderSighting({ shopId: SHOP, orderId: "999", amount: "80.00", currency: "USD" });

    expect(upserted[0].row).toMatchObject({
      attributed: false,
      had_cart_ref: false,
      had_landing_ref: false,
    });
  });

  it("stores no customer field", async () => {
    // The handler's data-minimisation posture is load-bearing for App Store
    // review, so the row is asserted to carry only these keys.
    await recordOrderSighting({ shopId: SHOP, orderId: "1", attributed: true });

    expect(Object.keys(upserted[0].row).sort()).toEqual([
      "amount",
      "attributed",
      "currency",
      "had_cart_ref",
      "had_landing_ref",
      "order_id",
      "shop_id",
    ]);
  });

  it("coerces a numeric order id, since Shopify sends both shapes", async () => {
    await recordOrderSighting({ shopId: SHOP, orderId: 7837479698537 });
    expect(upserted[0].row.order_id).toBe("7837479698537");
  });

  it.each([
    [null, "1"],
    [SHOP, null],
    [undefined, undefined],
  ])("writes nothing without both ids (%s, %s)", async (shopId, orderId) => {
    await recordOrderSighting({ shopId, orderId });
    expect(upserted).toHaveLength(0);
  });

  it("swallows a write failure rather than making Shopify retry the order", async () => {
    upsertError = { message: "constraint violation" };

    await expect(
      recordOrderSighting({ shopId: SHOP, orderId: "1" })
    ).resolves.toBeUndefined();
  });
});

describe("getOrderSightingsByShop", () => {
  it("counts seen and credited per shop", async () => {
    selectResult = {
      data: [
        { shop_id: "a", attributed: true },
        { shop_id: "a", attributed: false },
        { shop_id: "a", attributed: false },
        { shop_id: "b", attributed: true },
      ],
      error: null,
    };

    const byShop = await getOrderSightingsByShop();

    expect(byShop.get("a")).toEqual({ seen: 3, attributed: 1 });
    expect(byShop.get("b")).toEqual({ seen: 1, attributed: 1 });
  });

  it("returns an empty map on error rather than breaking the dashboard", async () => {
    selectResult = { data: null, error: { message: "boom" } };
    expect((await getOrderSightingsByShop()).size).toBe(0);
  });

  it("ignores rows with no shop", async () => {
    selectResult = { data: [{ shop_id: null, attributed: true }], error: null };
    expect((await getOrderSightingsByShop()).size).toBe(0);
  });
});
