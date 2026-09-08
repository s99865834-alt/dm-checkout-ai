/**
 * A settings save must only change what was passed to it.
 *
 * updateSettings used to coerce every omitted field to a hardcoded default, so
 * saving one thing rewrote the rest: passing just a deny-list switched both
 * automation toggles back on, and passing just a toggle wiped the deny-list.
 * Both callers happened to pass everything, so it never fired in production.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let existingRow = null;
let upserted = [];

vi.mock("../app/lib/supabase.server", () => {
  function chain() {
    const c = {};
    for (const m of ["select", "eq", "gte", "lte", "like", "is", "in", "order", "limit"]) {
      c[m] = () => c;
    }
    c.single = () => c;
    c.maybeSingle = () => c;
    c.upsert = (row) => {
      upserted.push(row);
      const res = {
        select: () => res,
        single: () => res,
        then: (r, j) => Promise.resolve({ data: { ...row }, error: null }).then(r, j),
      };
      return res;
    };
    c.then = (r, j) =>
      Promise.resolve(
        existingRow
          ? { data: existingRow, error: null }
          : { data: null, error: { code: "PGRST116", message: "No rows found" } }
      ).then(r, j);
    return c;
  }
  return { default: { from: () => chain(), rpc: async () => ({ data: null, error: null }) } };
});

const { updateSettings } = await import("../app/lib/db.server");

const SHOP = "shop-1";

const ROW = {
  shop_id: SHOP,
  dm_automation_enabled: false,
  comment_automation_enabled: true,
  followup_enabled: false,
  disabled_post_ids: ["post-a", "post-b"],
};

beforeEach(() => {
  upserted = [];
  existingRow = { ...ROW, disabled_post_ids: [...ROW.disabled_post_ids] };
});

describe("updateSettings", () => {
  it("leaves the deny-list alone when only toggles are passed", async () => {
    await updateSettings(SHOP, { dm_automation_enabled: true });

    expect(upserted[0].disabled_post_ids).toEqual(["post-a", "post-b"]);
    expect(upserted[0].dm_automation_enabled).toBe(true);
  });

  it("leaves the toggles alone when only the deny-list is passed", async () => {
    await updateSettings(SHOP, { disabled_post_ids: ["post-c"] });

    expect(upserted[0].disabled_post_ids).toEqual(["post-c"]);
    // The old version turned this back on, silently re-enabling automation a
    // merchant had switched off.
    expect(upserted[0].dm_automation_enabled).toBe(false);
    expect(upserted[0].followup_enabled).toBe(false);
  });

  it("can switch a toggle off without it being read as absent", async () => {
    existingRow.comment_automation_enabled = true;

    await updateSettings(SHOP, { comment_automation_enabled: false });

    expect(upserted[0].comment_automation_enabled).toBe(false);
  });

  it("writes an empty deny-list when that's what was asked for", async () => {
    await updateSettings(SHOP, { disabled_post_ids: [] });
    expect(upserted[0].disabled_post_ids).toEqual([]);
  });

  it("changes nothing when passed nothing", async () => {
    await updateSettings(SHOP, {});

    expect(upserted[0]).toMatchObject({
      dm_automation_enabled: false,
      comment_automation_enabled: true,
      followup_enabled: false,
      disabled_post_ids: ["post-a", "post-b"],
    });
  });

  it("falls back to the app's defaults for a shop with no row yet", async () => {
    // getSettings supplies these when the row is missing. They differ from the
    // column defaults, which have followup_enabled false.
    existingRow = null;

    await updateSettings(SHOP, { dm_automation_enabled: false });

    expect(upserted[0]).toMatchObject({
      dm_automation_enabled: false,
      comment_automation_enabled: true,
      followup_enabled: true,
      disabled_post_ids: [],
    });
  });

  it("ignores a non-boolean toggle rather than coercing it", async () => {
    await updateSettings(SHOP, { dm_automation_enabled: "true", comment_automation_enabled: null });

    expect(upserted[0].dm_automation_enabled).toBe(false);
    expect(upserted[0].comment_automation_enabled).toBe(true);
  });

  it("ignores a non-array deny-list", async () => {
    await updateSettings(SHOP, { disabled_post_ids: "post-c" });
    expect(upserted[0].disabled_post_ids).toEqual(["post-a", "post-b"]);
  });

  it.each([null, undefined, ""])("refuses to write without a shop id (%s)", async (shopId) => {
    await expect(updateSettings(shopId, { dm_automation_enabled: true })).rejects.toThrow(
      /shopId/
    );
    expect(upserted).toHaveLength(0);
  });
});
