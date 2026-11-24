import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { planWelcomeEmail } from "../app/lib/welcome-email";
import { renderWelcomeEmail, buildEmailLinks } from "../app/lib/weekly-email-template";

const NOW = new Date("2026-11-22T20:00:00Z");
const base = { isDevStore: false, isReviewShop: false, optedOut: false, email: "owner@shop.test", lastSentAt: null };

describe("planWelcomeEmail", () => {
  it("welcomes a new store", () => {
    expect(planWelcomeEmail(base, NOW)).toEqual({ send: true });
  });

  it("still welcomes a store whose dev flag is unknown", () => {
    expect(planWelcomeEmail({ ...base, isDevStore: null }, NOW)).toEqual({ send: true });
  });

  it.each([
    [{ isReviewShop: true }, "Shopify review store"],
    [{ isDevStore: true }, "Development store"],
    [{ optedOut: true }, "Unsubscribed"],
    [{ email: null }, "No owner email"],
    [{ email: "nope" }, "No owner email"],
    [{ lastSentAt: "2026-11-10T00:00:00Z" }, "Welcomed recently"],
  ])("skips %o", (override, reason) => {
    expect(planWelcomeEmail({ ...base, ...override }, NOW)).toEqual({ send: false, reason });
  });

  it("welcomes a reinstall after 30 days", () => {
    expect(planWelcomeEmail({ ...base, lastSentAt: "2026-10-01T00:00:00Z" }, NOW)).toEqual({ send: true });
  });
});

describe("renderWelcomeEmail", () => {
  const links = buildEmailLinks({ shopDomain: "vela.myshopify.com", appUrl: "https://www.socialrepl.ai", unsubscribeUrl: null });
  const facts = { storeName: "Vela", shopDomain: "vela.myshopify.com" };

  it("walks through the three setup steps, trial first, and links into the app", () => {
    const email = renderWelcomeEmail({ facts, links });
    expect(email.subject).toBe("Welcome to SocialRepl.ai: your first reply in 3 steps");
    expect(email.html).toContain("Welcome to SocialRepl.ai, Vela");
    expect(email.text).toContain("1. Open SocialRepl.ai and choose a plan. Your first 14 days are free.");
    expect(email.text).toContain("2. Connect your Instagram business account");
    expect(email.html).toContain("Start my free trial");
    expect(email.html).toContain(links.home);
  });

  it("offers a setup call", () => {
    const email = renderWelcomeEmail({ facts, links });
    expect(email.html).toContain(`href="${links.booking}"`);
    expect(email.text).toContain(`Book a setup call: ${links.booking}`);
  });

  it("is onboarding only: no plans, prices, or reviews", () => {
    const { html, text } = renderWelcomeEmail({ facts, links });
    for (const body of [html, text]) {
      expect(body).not.toMatch(/\$\d|Basic|Pro\b|upgrade|review/i);
      expect(body).toContain("Denver, CO");
      expect(body).not.toMatch(/\u2014/);
    }
  });

  it("greets a reinstall differently", () => {
    const email = renderWelcomeEmail({ facts, links, reinstall: true });
    expect(email.subject).toBe("Welcome back to SocialRepl.ai");
    expect(email.html).toContain("Welcome back, Vela");
  });
});

// The send path, with Shopify, Supabase and Postmark mocked.
const tables = {};
vi.mock("../app/lib/supabase.server", () => {
  const from = (table) => {
    const q = {
      _table: table,
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      upsert: async (row) => {
        tables[`${table}:upsert`] = row;
        return { error: null };
      },
      update: (row) => {
        tables[`${table}:update`] = row;
        return { eq: async () => ({ error: null }) };
      },
    };
    return q;
  };
  return { default: { from } };
});
vi.mock("../app/lib/postmark.server", () => ({
  postmarkConfigured: () => true,
  sendBatch: vi.fn(async () => [{ ok: true, messageId: "pm-1" }]),
}));

const { sendWelcomeEmail } = await import("../app/lib/welcome-email.server");
const { sendBatch } = await import("../app/lib/postmark.server");

const admin = { graphql: async () => ({ json: async () => ({ data: { shop: { email: "Owner@Vela.test", name: "Vela" } } }) }) };

describe("sendWelcomeEmail", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    tables.shops = { id: "shop-1" };
    sendBatch.mockClear();
    vi.stubEnv("WELCOME_EMAIL_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does nothing until it is switched on", async () => {
    vi.stubEnv("WELCOME_EMAIL_ENABLED", "");
    const res = await sendWelcomeEmail({ admin, shopDomain: "vela.myshopify.com", kind: "install", isDevStore: false });
    expect(res.sent).toBe(false);
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("sends to the shop owner on the transactional stream and logs it", async () => {
    const res = await sendWelcomeEmail({ admin, shopDomain: "vela.myshopify.com", kind: "install", isDevStore: false });
    expect(res.sent).toBe(true);
    const [[msg]] = sendBatch.mock.calls[0];
    expect(msg).toMatchObject({ to: "owner@vela.test", stream: "outbound", metadata: { shop_id: "shop-1", kind: "welcome" } });
    expect(msg.subject).toBe("Welcome to SocialRepl.ai: your first reply in 3 steps");
    expect(msg.subject).not.toContain("[Test]");
    expect(msg.unsubscribeUrl).toBeUndefined();
    expect(tables["email_welcomes:update"]).toMatchObject({ status: "sent", provider_message_id: "pm-1" });
  });

  it("skips dev stores and stores welcomed in the last 30 days", async () => {
    await sendWelcomeEmail({ admin, shopDomain: "vela.myshopify.com", kind: "install", isDevStore: true });
    tables.email_welcomes = { sent_at: new Date().toISOString(), status: "sent" };
    await sendWelcomeEmail({ admin, shopDomain: "vela.myshopify.com", kind: "reinstall", isDevStore: false });
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("never throws into the install flow", async () => {
    const broken = { graphql: async () => { throw new Error("Shopify down"); } };
    await expect(sendWelcomeEmail({ admin: broken, shopDomain: "vela.myshopify.com", kind: "install", isDevStore: false })).resolves.toMatchObject({ sent: false });
  });
});
