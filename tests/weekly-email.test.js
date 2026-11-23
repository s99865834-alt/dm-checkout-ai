import { describe, it, expect } from "vitest";
import {
  weekStartUtc,
  ownerEmailFromContext,
  planWeeklyEmail,
  upsellFor,
  parseReviewerNames,
  normalizeStoreName,
  MAX_CONNECT_NUDGES,
} from "../app/lib/weekly-email";
import { renderWeeklyEmail, buildEmailLinks, escapeHtml, replaceUnsubscribeLink } from "../app/lib/weekly-email-template";
import { getPlanConfig } from "../app/lib/plans";

const NOW = new Date("2026-11-20T16:00:00Z"); // a Friday
const WEEK = "2026-11-16";

function facts(overrides = {}) {
  return {
    shopId: "shop-1",
    shopDomain: "vela.myshopify.com",
    storeName: "Vela",
    email: "owner@vela.test",
    active: true,
    isDevStore: false,
    isReviewShop: false,
    optedOut: false,
    installedAt: "2026-09-01T00:00:00Z",
    reviewed: false,
    igConnected: true,
    week: { received: 40, responded: 38, linksSent: 30, clicks: 12, orders: 0, revenue: 0, currency: "USD" },
    last14Received: 60,
    last28Responded: 120,
    ordersAllTime: 0,
    storyThisMonth: 0,
    missedComments: 0,
    plan: getPlanConfig("GROWTH"),
    usage: 200,
    cap: 1000,
    insight: null,
    replyHoursOn: false,
    ...overrides,
  };
}

const sent = (week_start, kind, extras = []) => ({ week_start, kind, extras, status: "sent" });

describe("weekStartUtc", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartUtc(NOW)).toBe(WEEK);
    expect(weekStartUtc(new Date("2026-11-16T00:00:00Z"))).toBe(WEEK);
    expect(weekStartUtc(new Date("2026-11-22T23:59:00Z"))).toBe(WEEK);
  });
});

describe("ownerEmailFromContext", () => {
  it("prefers the Shopify owner email", () => {
    expect(ownerEmailFromContext({ ownerEmail: "Owner@Shop.com", email: "help@shop.com", emailSource: "page" })).toBe("owner@shop.com");
  });

  it("uses the legacy email only when it was the owner inbox", () => {
    expect(ownerEmailFromContext({ email: "owner@shop.com" })).toBe("owner@shop.com");
    expect(ownerEmailFromContext({ email: "help@shop.com", emailSource: "footer" })).toBeNull();
  });

  it("rejects junk", () => {
    expect(ownerEmailFromContext({ ownerEmail: "not an email" })).toBeNull();
    expect(ownerEmailFromContext(null)).toBeNull();
  });
});

describe("planWeeklyEmail: who is skipped", () => {
  it.each([
    [{ active: false }, "Uninstalled"],
    [{ isDevStore: true }, "Development store"],
    [{ isReviewShop: true }, "Shopify review store"],
    [{ optedOut: true }, "Unsubscribed"],
    [{ email: null }, "No owner email"],
  ])("skips %o", (override, reason) => {
    expect(planWeeklyEmail(facts(override), [], NOW)).toEqual({ send: false, reason });
  });

  it("never sends twice in one week", () => {
    expect(planWeeklyEmail(facts(), [sent(WEEK, "report")], NOW).send).toBe(false);
  });

  it("retries a week whose send failed", () => {
    const failed = { ...sent(WEEK, "report"), status: "failed" };
    expect(planWeeklyEmail(facts(), [failed], NOW).send).toBe(true);
  });
});

describe("planWeeklyEmail: main message", () => {
  it("nudges an unconnected shop, then stops", () => {
    const f = facts({ igConnected: false });
    expect(planWeeklyEmail(f, [], NOW)).toMatchObject({ send: true, kind: "connect" });
    const history = Array.from({ length: MAX_CONNECT_NUDGES }, (_, i) => sent(`2026-10-${10 + i}`, "connect"));
    expect(planWeeklyEmail(f, history, NOW)).toEqual({ send: false, reason: "Connect reminders used up" });
  });

  it("sends a setup check after 14 silent days, at most twice between reports", () => {
    const f = facts({ week: { received: 0 }, last14Received: 0 });
    expect(planWeeklyEmail(f, [], NOW)).toMatchObject({ kind: "setup" });
    expect(planWeeklyEmail(f, [sent("2026-11-09", "setup"), sent("2026-11-02", "setup")], NOW).send).toBe(false);
    expect(
      planWeeklyEmail(f, [sent("2026-11-09", "setup"), sent("2026-11-02", "report"), sent("2026-10-26", "setup")], NOW)
    ).toMatchObject({ kind: "setup" });
  });

  it("skips a quiet week for a shop that was busy recently", () => {
    expect(planWeeklyEmail(facts({ week: { received: 0 }, last14Received: 9 }), [], NOW)).toEqual({ send: false, reason: "Quiet week" });
  });

  it("reports on a week with customer messages", () => {
    expect(planWeeklyEmail(facts(), [], NOW)).toMatchObject({ send: true, kind: "report" });
  });
});

describe("planWeeklyEmail: review ask", () => {
  it("asks once the shop has real value and enough time", () => {
    expect(planWeeklyEmail(facts(), [], NOW).extras).toEqual(["review"]);
  });

  it("waits for 14 days and for real use", () => {
    expect(planWeeklyEmail(facts({ installedAt: "2026-11-15T00:00:00Z" }), [], NOW).extras).not.toContain("review");
    expect(planWeeklyEmail(facts({ last28Responded: 5 }), [], NOW).extras).not.toContain("review");
    expect(planWeeklyEmail(facts({ last28Responded: 5, ordersAllTime: 1 }), [], NOW).extras).toContain("review");
  });

  it("never asks a shop that already reviewed", () => {
    expect(planWeeklyEmail(facts({ reviewed: true }), [], NOW).extras).not.toContain("review");
  });

  it("asks nobody when the App Store could not be checked", () => {
    expect(planWeeklyEmail(facts({ reviewed: null }), [], NOW).extras).not.toContain("review");
  });

  it("leaves at least 8 weeks between asks", () => {
    expect(planWeeklyEmail(facts(), [sent("2026-10-12", "report", ["review"])], NOW).extras).not.toContain("review");
    expect(planWeeklyEmail(facts(), [sent("2026-09-21", "report", ["review"])], NOW).extras).toContain("review");
  });
});

describe("parseReviewerNames", () => {
  const block = (name) =>
    `<div class="tw-text-heading-xs tw-text-fg-primary tw-flex tw-items-center tw-gap-xs tw-group">\n        <span class="tw-overflow-hidden tw-text-ellipsis tw-whitespace-nowrap" title="${name}">\n          ${name}\n        </span>`;

  it("reads reviewer store names, normalized for matching", () => {
    const names = parseReviewerNames(`${block("Range Brush")}<p>text</p>${block("Love By Luna")}${block("Tom &amp; Co.")}`);
    expect([...names]).toEqual(["range brush", "love by luna", "tom co"]);
    expect(names.has(normalizeStoreName("Love by Luna!"))).toBe(true);
  });

  it("returns nothing for unrelated markup", () => {
    expect(parseReviewerNames('<span title="Not a reviewer">x</span>').size).toBe(0);
  });
});

describe("upsells", () => {
  const quiet = { last28Responded: 0 };

  it("points at Pro when story replies go unanswered", () => {
    expect(upsellFor(facts({ storyThisMonth: 7 }))).toEqual({ to: "PRO", reason: "stories", count: 7 });
  });

  it("points at the next plan near the cap", () => {
    expect(upsellFor(facts({ usage: 850 }))).toMatchObject({ to: "PRO", reason: "cap" });
    expect(upsellFor(facts({ plan: getPlanConfig("FREE"), usage: 22, cap: 25 }))).toMatchObject({ to: "GROWTH", reason: "cap" });
  });

  it("points Free shops missing comments at Basic", () => {
    expect(upsellFor(facts({ plan: getPlanConfig("FREE"), usage: 3, cap: 25, missedComments: 4 }))).toMatchObject({ to: "GROWTH", reason: "comments" });
  });

  it("never upsells Pro or a shop with no evidence", () => {
    expect(upsellFor(facts({ plan: getPlanConfig("PRO"), storyThisMonth: 50, usage: 9999, cap: 10000 }))).toBeNull();
    expect(upsellFor(facts())).toBeNull();
  });

  it("is never in the same email as a review ask", () => {
    const d = planWeeklyEmail(facts({ storyThisMonth: 7 }), [], NOW);
    expect(d.extras).toEqual(["review"]);
    expect(d.upsell).toBeNull();
  });

  it("is offered at most every other week", () => {
    const f = facts({ ...quiet, storyThisMonth: 7 });
    expect(planWeeklyEmail(f, [], NOW).extras).toEqual(["upsell"]);
    expect(planWeeklyEmail(f, [sent("2026-11-09", "report", ["upsell"])], NOW).extras).toEqual([]);
    expect(planWeeklyEmail(f, [sent("2026-11-02", "report", ["upsell"])], NOW).extras).toEqual(["upsell"]);
  });
});

describe("renderWeeklyEmail", () => {
  const links = buildEmailLinks({ shopDomain: "vela.myshopify.com", appUrl: "https://www.socialrepl.ai", unsubscribeUrl: "https://www.socialrepl.ai/email/unsubscribe?s=1&t=x" });

  it("links into the store's own admin", () => {
    expect(links.home).toBe("https://admin.shopify.com/store/vela/apps/socialreplai");
    expect(links.analytics).toBe("https://admin.shopify.com/store/vela/apps/socialreplai/app/analytics");
  });

  it.each(["connect", "setup", "report"])("renders a %s email with unsubscribe and postal address", (kind) => {
    const email = renderWeeklyEmail({ decision: { send: true, kind, extras: [], upsell: null }, facts: facts(), links });
    expect(email.subject.length).toBeGreaterThan(10);
    for (const body of [email.html, email.text]) {
      expect(body).toContain("unsubscribe");
      expect(body).toContain("Denver, CO");
    }
    expect(email.html).not.toMatch(/\u2014/);
    expect(email.text).not.toMatch(/\u2014/);
  });

  it("puts orders in the subject when there were any", () => {
    const f = facts({ week: { received: 10, responded: 10, linksSent: 8, clicks: 5, orders: 2, revenue: 84, currency: "USD" } });
    const email = renderWeeklyEmail({ decision: { send: true, kind: "report", extras: [], upsell: null }, facts: f, links });
    expect(email.subject).toBe("2 orders from Instagram this week");
    expect(email.html).toContain("$84");
  });

  it("escapes store names and AI-written topic labels", () => {
    const f = facts({ storeName: "<b>Evil</b>", insight: { topics: [{ label: "<script>x</script>", count: 3 }], action: null } });
    const email = renderWeeklyEmail({ decision: { send: true, kind: "report", extras: [], upsell: null }, facts: f, links });
    expect(email.html).not.toContain("<script>x");
    expect(email.html).toContain(escapeHtml("<b>Evil</b>"));
  });

  it("swaps the unsubscribe link everywhere for test sends", () => {
    const real = "https://www.socialrepl.ai/email/unsubscribe?s=shop-1&t=abc";
    const dummy = "https://www.socialrepl.ai/email/unsubscribe?s=test&t=test";
    const l = { ...links, unsubscribe: real };
    const email = renderWeeklyEmail({ decision: { send: true, kind: "connect", extras: [], upsell: null }, facts: facts(), links: l });
    const swapped = replaceUnsubscribeLink(email, real, dummy);
    expect(email.html).toContain(escapeHtml(real));
    for (const body of [swapped.html, swapped.text]) {
      expect(body).not.toContain("s=shop-1");
      expect(body).toContain("s=test");
    }
  });

  it("includes the review ask and the upsell only when decided", () => {
    const base = { send: true, kind: "report", upsell: null };
    expect(renderWeeklyEmail({ decision: { ...base, extras: [] }, facts: facts(), links }).html).not.toContain(links.review);
    expect(renderWeeklyEmail({ decision: { ...base, extras: ["review"] }, facts: facts(), links }).html).toContain(links.review);
    const upsell = { to: "PRO", reason: "stories", count: 7 };
    const html = renderWeeklyEmail({ decision: { ...base, extras: ["upsell"], upsell }, facts: facts(), links }).html;
    expect(html).toContain("7 story replies went unanswered");
    expect(html).toContain(links.billing);
  });
});
