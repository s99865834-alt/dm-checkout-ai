/**
 * app/scopes_update must not 500.
 *
 * It returned one during a live plan upgrade on 29 Sep 2026. Shopify delivers
 * this webhook while the app is loading and the session row is being rotated,
 * so the scope write can hit a row that is momentarily missing. The handler was
 * unguarded, so that surfaced as a 500, Shopify retried, and a webhook that
 * keeps failing risks having its subscription turned off. Writing the scope is
 * bookkeeping; nothing the request returns depends on it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  webhook: null,
  updateError: null,
  updates: [],
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: {
    webhook: async () => {
      if (state.webhook instanceof Error) throw state.webhook;
      if (state.webhook instanceof Response) throw state.webhook;
      return state.webhook;
    },
  },
}));

vi.mock("../app/db.server", () => ({
  default: {
    session: {
      update: async (args) => {
        if (state.updateError) throw state.updateError;
        state.updates.push(args);
        return args;
      },
    },
  },
}));

const { action, loader } = await import("../app/routes/webhooks.app.scopes_update");

const request = () => new Request("https://app.example.com/webhooks/app/scopes_update", { method: "POST" });

beforeEach(() => {
  state.updates = [];
  state.updateError = null;
  state.webhook = {
    topic: "APP_SCOPES_UPDATE",
    shop: "socialreplai.myshopify.com",
    session: { id: "sess-1" },
    payload: { current: ["read_products", "read_orders"] },
  };
});

describe("app/scopes_update", () => {
  it("stores the new scope on the session", async () => {
    const res = await action({ request: request() });
    expect(res.status).toBe(200);
    expect(state.updates[0].data.scope).toBe("read_products,read_orders");
  });

  it("does not 500 when the session row is missing mid-rotation", async () => {
    state.updateError = Object.assign(new Error("Record to update not found"), { code: "P2025" });
    const res = await action({ request: request() });
    expect(res.status).toBe(200);
  });

  it("does not 500 when the payload has no scopes", async () => {
    state.webhook = { ...state.webhook, payload: {} };
    const res = await action({ request: request() });
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(0);
  });

  it("does not 500 when there is no session", async () => {
    state.webhook = { ...state.webhook, session: null };
    const res = await action({ request: request() });
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(0);
  });

  it("still rejects a forged request with Shopify's own status", async () => {
    state.webhook = new Response("Unauthorized", { status: 401 });
    await expect(action({ request: request() })).rejects.toMatchObject({ status: 401 });
  });

  it("answers a crawler GET with 405 rather than rendering", () => {
    expect(loader().status).toBe(405);
  });
});
