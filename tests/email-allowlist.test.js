/**
 * A reply must never contain an email address the store does not have.
 *
 * Shanese Cares, 20 Oct 2026. A DM read "my name is Stephan and I built the
 * shopify app SocialRepl.ai that you are using". The model lifted the app name
 * out of the customer's own words, built "info@socialrepl.ai" from it, and
 * handed it to the merchant's customer as the store's contact address:
 *
 *   "Thanks so much for reaching out, Stephan! The store owner handles app
 *    feedback and technical questions directly. You can contact them at their
 *    email: info@socialrepl.ai."
 *
 * The store context held the correct info@shanesecaresllc.com the entire time,
 * and the address it invented does not exist. URLs have been allowlisted for a
 * while for exactly this reason; emails were not.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = { completions: { create: async () => ({ choices: [{ message: { content: "" } }] }) } };
    }
  },
}));
vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({}), rpc: async () => ({ data: null, error: null }) },
}));
vi.mock("../app/shopify.server", () => ({
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
}));

const { sanitizeReplyText } = await import("../app/lib/sales-agent.server");
const { stripUnknownEmails } = await import("../app/lib/reply-rules");

const NO_URLS = new Set();
const REAL = "info@shanesecaresllc.com";
const FAKE_REPLY =
  "Thanks so much for reaching out, Stephan! The store owner handles app feedback and technical questions directly. You can contact them at their email: info@socialrepl.ai.";

describe("email allowlist", () => {
  it("replaces a fabricated address with the store's real one", () => {
    const { text } = sanitizeReplyText(FAKE_REPLY, NO_URLS, new Set([REAL]));
    expect(text).not.toContain("socialrepl.ai");
    expect(text).toContain(REAL);
  });

  it("removes a fabricated address entirely when we know of no real one", () => {
    const { text } = sanitizeReplyText(FAKE_REPLY, NO_URLS, new Set());
    expect(text).not.toContain("socialrepl.ai");
    expect(text).not.toMatch(/@/);
    // And it must not leave "contact them at their email:" dangling.
    expect(text).not.toMatch(/email\s*:\s*\.?$/i);
  });

  it("leaves the store's own address untouched", () => {
    const reply = `Happy to help! You can reach the team at ${REAL} and they'll sort it out.`;
    const { text } = sanitizeReplyText(reply, NO_URLS, new Set([REAL]));
    expect(text).toContain(REAL);
  });

  it("matches the store address case-insensitively", () => {
    const reply = "Email us at Info@ShaneseCaresLLC.com for help.";
    const { text } = sanitizeReplyText(reply, NO_URLS, new Set([REAL]));
    expect(text).toContain("Info@ShaneseCaresLLC.com");
  });

  it("strips a second invented address even when the real one is present", () => {
    const reply = `Reach us at ${REAL} or at support@totallymadeup.example for anything else.`;
    const { text } = sanitizeReplyText(reply, NO_URLS, new Set([REAL]));
    expect(text).not.toContain("totallymadeup");
    expect(text).toContain(REAL);
  });

  it("does not disturb a reply with no email in it", () => {
    const reply = "The Rose Quartz Heart is $24 and comes in two sizes. Which would you like?";
    const { text } = sanitizeReplyText(reply, NO_URLS, new Set([REAL]));
    expect(text).toBe(reply);
  });

  it("defaults to stripping when no allowlist is passed at all", () => {
    // Guards the legacy two-argument call shape.
    const { text } = sanitizeReplyText(FAKE_REPLY, NO_URLS);
    expect(text).not.toContain("socialrepl.ai");
  });
});

/**
 * The same guard runs on the legacy generateReplyMessage path, which had none
 * at all. store_question replies and every non-agent fallback go through it,
 * so an invented address had an open route there too.
 */
describe("stripUnknownEmails, shared by both reply paths", () => {
  it("substitutes the store address for an invented one", () => {
    const { text, stripped } = stripUnknownEmails(FAKE_REPLY, new Set([REAL]));
    expect(text).toContain(REAL);
    expect(text).not.toContain("socialrepl.ai");
    expect(stripped).toBe(false); // substituted, not dropped
  });

  it("reports when it had to drop an address outright", () => {
    const { text, stripped } = stripUnknownEmails(FAKE_REPLY, new Set());
    expect(stripped).toBe(true);
    expect(text).not.toMatch(/@/);
  });

  it("will not invent from common patterns the model reaches for", () => {
    for (const fake of [
      "info@shabby2chicboutiques.com",
      "support@lovebyluna.co",
      "hello@stateofher.co",
    ]) {
      const { text } = stripUnknownEmails(`Email us at ${fake} for help.`, new Set());
      expect(text, fake).not.toContain(fake);
    }
  });

  it("handles empty input without throwing", () => {
    expect(stripUnknownEmails("", new Set()).text).toBe("");
    expect(stripUnknownEmails(null, new Set()).text).toBe(null);
  });
});
