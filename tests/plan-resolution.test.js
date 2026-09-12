/**
 * Which plan a merchant ends up on, given what Shopify says they bought.
 *
 * The case that matters most here is the activation URL. Shopify appends
 * ?plan= to the return URL after Managed Pricing approval, and that used to
 * outrank the subscription itself, on a GET the merchant can replay at will.
 * Anyone holding an active Growth subscription could visit
 * /app/billing/activate?plan=PRO and keep Pro capabilities on a $39 charge.
 */
import { describe, it, expect } from "vitest";
import {
  planFromSubscription,
  resolveActivationPlan,
} from "../app/lib/plan-resolution";

const active = (name) => ({ name, status: "ACTIVE" });

describe("planFromSubscription", () => {
  it("reports FREE when there is no subscription at all", () => {
    expect(planFromSubscription(null)).toBe("FREE");
    expect(planFromSubscription(undefined)).toBe("FREE");
  });

  it.each(["CANCELLED", "EXPIRED", "FROZEN", "DECLINED", "PENDING"])(
    "reports FREE for a %s subscription",
    (status) => {
      expect(planFromSubscription({ name: "Pro", status })).toBe("FREE");
    },
  );

  it.each([
    ["Pro", "PRO"],
    ["pro", "PRO"],
    ["PRO", "PRO"],
    ["Pro Plan", "PRO"],
    ["SocialReplAI Pro", "PRO"],
    ["Growth", "GROWTH"],
    ["growth", "GROWTH"],
    ["Growth Plan", "GROWTH"],
    ["SocialReplAI Growth", "GROWTH"],
  ])("maps the subscription named %s to %s", (name, expected) => {
    expect(planFromSubscription(active(name))).toBe(expected);
  });

  it("returns null rather than guessing on a name it does not recognise", () => {
    // null means "leave shop.plan alone". Returning FREE here would downgrade
    // a paying merchant because someone renamed a plan in the Partner
    // Dashboard, which is the one outcome worse than doing nothing.
    expect(planFromSubscription(active("Enterprise"))).toBeNull();
    expect(planFromSubscription(active(""))).toBeNull();
    expect(planFromSubscription({ status: "ACTIVE" })).toBeNull();
  });
});

describe("resolveActivationPlan", () => {
  it("ignores a plan param that contradicts the live subscription", () => {
    expect(resolveActivationPlan(active("Growth"), "PRO")).toBe("GROWTH");
    expect(resolveActivationPlan(active("Growth"), "pro")).toBe("GROWTH");
    expect(resolveActivationPlan(active("Pro"), "GROWTH")).toBe("PRO");
  });

  it("will not let a shop with no subscription claim a paid plan", () => {
    expect(resolveActivationPlan(null, "PRO")).toBe("FREE");
    expect(resolveActivationPlan({ name: "Pro", status: "CANCELLED" }, "PRO")).toBe("FREE");
  });

  it("agrees with the subscription when the param matches it", () => {
    expect(resolveActivationPlan(active("Growth"), "GROWTH")).toBe("GROWTH");
    expect(resolveActivationPlan(active("Pro"), "PRO")).toBe("PRO");
  });

  it("falls back to the param only for an unrecognised subscription name", () => {
    // This is the case the param was added for: an active subscription that
    // our name matching cannot place.
    expect(resolveActivationPlan(active("Enterprise"), "PRO")).toBe("PRO");
    expect(resolveActivationPlan(active("Enterprise"), "growth")).toBe("GROWTH");
  });

  it("returns null when neither the subscription nor the param resolves", () => {
    expect(resolveActivationPlan(active("Enterprise"), null)).toBeNull();
    expect(resolveActivationPlan(active("Enterprise"), "")).toBeNull();
    expect(resolveActivationPlan(active("Enterprise"), "ENTERPRISE")).toBeNull();
    expect(resolveActivationPlan(active("Enterprise"), "../PRO")).toBeNull();
  });
});
