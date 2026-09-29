/**
 * Disconnecting must tell Meta to stop sending, not just stop us listening.
 *
 * deleteMetaAuth only removed our meta_auth row, so Meta kept delivering the
 * account's DMs and comments indefinitely and the webhook logged them as
 * "No shop for ig_business_id" and discarded them. A merchant who uninstalled
 * on 27 Sep 2026 was still producing those two days later.
 *
 * It must also never block the disconnect the merchant asked for: if Meta is
 * unreachable, we report failure and the caller carries on deleting the row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  authRow: null,
  fetches: [],
  apiError: null,
}));

// A token that expires far in the future, so getMetaAuthWithRefresh returns it
// as-is instead of trying to refresh.
const FAR_FUTURE = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

vi.mock("../app/lib/supabase.server", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: state.authRow, error: null }),
    single: async () => ({ data: state.authRow, error: null }),
  };
  return { default: { from: () => chain } };
});

vi.mock("../app/lib/crypto.server", () => ({
  encryptToken: (v) => v,
  decryptToken: (v) => v,
}));

const { unsubscribeInstagramWebhooks } = await import("../app/lib/meta.server");

beforeEach(() => {
  state.fetches = [];
  state.apiError = null;
  // getMetaAuth reads the encrypted column and decrypts it into
  // page_access_token, so the row has to carry page_token_enc.
  state.authRow = {
    id: "auth-1",
    shop_id: "shop-1",
    auth_type: "instagram",
    page_token_enc: "tok-123",
    token_expires_at: FAR_FUTURE,
  };
  vi.stubGlobal("fetch", async (url, opts = {}) => {
    state.fetches.push({ url: String(url), method: opts.method || "GET" });
    const body = state.apiError
      ? { error: { message: state.apiError, code: 190 } }
      : { success: true };
    return new Response(JSON.stringify(body), {
      status: state.apiError ? 400 : 200,
      headers: { "Content-Type": "application/json" },
    });
  });
});

describe("unsubscribeInstagramWebhooks", () => {
  it("sends a DELETE to subscribed_apps so Meta stops delivering", async () => {
    await expect(unsubscribeInstagramWebhooks("shop-1")).resolves.toBe(true);
    const call = state.fetches.at(-1);
    expect(call.method).toBe("DELETE");
    expect(call.url).toContain("/me/subscribed_apps");
  });

  it("reports failure instead of throwing when Meta refuses, so the disconnect still proceeds", async () => {
    state.apiError = "Invalid OAuth access token";
    await expect(unsubscribeInstagramWebhooks("shop-1")).resolves.toBe(false);
    expect(state.fetches.at(-1).method).toBe("DELETE");
  });

  it("does nothing without a shop id", async () => {
    await expect(unsubscribeInstagramWebhooks(null)).resolves.toBe(false);
    expect(state.fetches).toHaveLength(0);
  });

  it("does nothing for a shop with no Instagram connection", async () => {
    state.authRow = null;
    await expect(unsubscribeInstagramWebhooks("shop-1")).resolves.toBe(false);
    expect(state.fetches).toHaveLength(0);
  });
});
