import { describe, it, expect } from "vitest";
import { fetchIsDevStore } from "../app/lib/dev-store.server";

const adminReturning = (body) => ({ graphql: async () => ({ json: async () => body }) });

describe("fetchIsDevStore", () => {
  it("reads shop.plan.partnerDevelopment", async () => {
    expect(await fetchIsDevStore(adminReturning({ data: { shop: { plan: { partnerDevelopment: true } } } }))).toBe(true);
    expect(await fetchIsDevStore(adminReturning({ data: { shop: { plan: { partnerDevelopment: false } } } }))).toBe(false);
  });

  it("returns null when Shopify can't say, so nothing is flagged on a guess", async () => {
    expect(await fetchIsDevStore(adminReturning({ errors: [{ message: "Throttled" }] }))).toBe(null);
    expect(await fetchIsDevStore({ graphql: async () => { throw new Error("network"); } })).toBe(null);
  });
});
