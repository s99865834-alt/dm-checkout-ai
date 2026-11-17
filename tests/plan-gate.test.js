import { describe, it, expect } from "vitest";
import { needsPlanSelection } from "../app/lib/plan-gate";

const locked = { locked: true };
const shopDomain = "dante.myshopify.com";

describe("needsPlanSelection", () => {
  it("sends a store with no plan to Shopify's plan page", () => {
    expect(needsPlanSelection({ plan: locked, pathname: "/app", shopDomain })).toBe(true);
    expect(needsPlanSelection({ plan: locked, pathname: "/app/analytics", shopDomain })).toBe(true);
  });

  it("leaves stores with a plan or in Free grace alone", () => {
    expect(needsPlanSelection({ plan: { locked: false }, pathname: "/app", shopDomain })).toBe(false);
    expect(needsPlanSelection({ plan: null, pathname: "/app", shopDomain })).toBe(false);
  });

  it("never redirects billing routes, where Shopify returns after a charge", () => {
    expect(needsPlanSelection({ plan: locked, pathname: "/app/billing/activate", shopDomain })).toBe(false);
    expect(needsPlanSelection({ plan: locked, pathname: "/app/billing/select.data", shopDomain })).toBe(false);
  });

  it("skips Shopify's automated review shops", () => {
    expect(
      needsPlanSelection({ plan: locked, pathname: "/app", shopDomain: "app-review-123-primary.myshopify.com" }),
    ).toBe(false);
  });
});
