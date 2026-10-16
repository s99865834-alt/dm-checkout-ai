/**
 * The explicit-link-request rescue must not answer spam.
 *
 * It exists so a terse "send me the link" gets a reply even when the
 * classifier calls it clarification_needed. It was doing far more than that.
 *
 * Shabby 2 Chic, 16 Oct 2026. An Instagram promotion seller pitched packages
 * from $35 to $199. The classifier scored it not_relevant at 0.95, correctly.
 * The pitch contained "I will promote you untill you will get 10k followers"
 * and, several lines later, "Website link in bio". The old pattern allowed any
 * distance between the verb and the word "link" as long as no .!? separated
 * them, so it matched across the gap, forced the intent to purchase, and we
 * answered a spammer on a Pro merchant's quota. Four of that merchant's five
 * delivered replies that day went to the same seller.
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

import { isExplicitLinkRequest } from "../app/lib/sales-agent.server";

// Verbatim from the real DM, trimmed to the two lines that mattered.
const PROMO_SPAM = `I Will Promote our Content On our Strong network.

@etsy.magazine
@etsy_explorer

1 Month Package
$119 Unlimited post for 30 Day's
(7k+ followers)

I will promote you untill you will get 10k followers = $199
Mention in bio
Website link in bio`;

describe("isExplicitLinkRequest", () => {
  it("still catches a customer actually asking for one", () => {
    for (const text of [
      "link",
      "link?",
      "link please",
      "yes link",
      "can you send me the link",
      "send me a link absolutely",
      "do you have a link for this",
      "I need the link to that dress",
      "drop the link!",
    ]) {
      expect(isExplicitLinkRequest(text), text).toBe(true);
    }
  });

  it("no longer matches the promotion pitch that cost Shabby four replies", () => {
    expect(isExplicitLinkRequest(PROMO_SPAM)).toBe(false);
  });

  it("does not span unrelated sentences or lines", () => {
    // "get" and "link" both present, but nowhere near each other.
    expect(
      isExplicitLinkRequest("you will get 10k followers\nMention in bio\nWebsite link in bio")
    ).toBe(false);
    expect(
      isExplicitLinkRequest(
        "want to grow your audience with our managed service, our website link is in the bio"
      )
    ).toBe(false);
  });

  it("ignores empty and junk input", () => {
    expect(isExplicitLinkRequest("")).toBe(false);
    expect(isExplicitLinkRequest(null)).toBe(false);
    expect(isExplicitLinkRequest("🔥🔥🔥")).toBe(false);
  });
});
