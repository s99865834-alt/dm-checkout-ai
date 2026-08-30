/**
 * Guards the class of bug where an empty catalog lookup got reported straight
 * back to the customer. Every "must be caught" case below is a reply that was
 * actually sent from production; the "must be allowed" cases are the honest
 * answers that share vocabulary with them and must keep working.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../app/lib/db.server", () => ({ getStoredStoreContext: vi.fn() }));
vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyStoreInfo: vi.fn(),
  getShopifyProductContextForReply: vi.fn(),
  buildStoreContextForAI: vi.fn(),
  searchProductsByDomain: vi.fn(),
}));
vi.mock("../app/lib/storefront-catalog.server", () => ({ searchCatalogNormalized: vi.fn() }));
vi.mock("../app/lib/links.server", () => ({
  buildCheckoutLink: vi.fn(),
  buildProductPageLink: vi.fn(),
  getTrackedLinkUrl: vi.fn(),
  shortenUrlsInReply: vi.fn(),
  getShopHomepageUrl: vi.fn(),
}));

const { narratesFailedLookup } = await import("../app/lib/sales-agent.server");

describe("narratesFailedLookup", () => {
  // Verbatim from production: Shane's and Mark's stores, Aug 29-30.
  const mustBeCaught = [
    `I couldn't find a product called "peel" in the store, but let me know what you're after!`,
    `I couldn't find any products by "Khadine" right now.`,
    `I couldn't find a product titled "p4 Rover" in our catalog.`,
    `I couldn't find a product called "TFCon" but happy to help!`,
    // Same failure, other phrasings the model reaches for.
    `I can't find any items matching that.`,
    `We couldn't locate that product, sorry!`,
    `I searched our catalog and nothing came up.`,
    `I looked for that but came up empty.`,
    `Unfortunately I don't see any products like that.`,
    `There are no products matching that description.`,
    `I was unable to find any listings for that.`,
  ];

  for (const reply of mustBeCaught) {
    it(`catches: ${reply.slice(0, 52)}...`, () => {
      expect(narratesFailedLookup(reply)).toBe(true);
    });
  }

  // Honest, useful replies. Flagging these would cost a needless model pass
  // and could push a perfectly good answer to the legacy pipeline.
  const mustBeAllowed = [
    `We don't carry that one, but the Aurora Serum is really close!`,
    `That style is sold out right now, sorry!`,
    `Let me know if you can't find it on the site and I'll help.`,
    `I don't have that information, but you can reach the team at hi@store.com.`,
    `Which size were you after? It comes in S, M, and L.`,
    `Love that! It's $42 and ships free.`,
    // Lookups that SUCCEEDED are useful to mention; only empty ones are a bug.
    `I looked up the shipping cost for you, it's $8 flat.`,
    `I checked our store policy and returns are open for 30 days.`,
    `I searched and found three that would work.`,
    `You can see everything here: https://store.com/collections/all`,
    `We're out of the blue, but the black is in stock.`,
    `I can't wait for you to try it!`,
    `Not sure which colour you mean, we have three.`,
  ];

  for (const reply of mustBeAllowed) {
    it(`allows: ${reply.slice(0, 52)}...`, () => {
      expect(narratesFailedLookup(reply)).toBe(false);
    });
  }

  it("treats empty input as clean", () => {
    expect(narratesFailedLookup("")).toBe(false);
    expect(narratesFailedLookup(null)).toBe(false);
    expect(narratesFailedLookup(undefined)).toBe(false);
  });

  it("does not flag the customer being unable to find something", () => {
    expect(narratesFailedLookup("If you can't find the product page, I can send it over.")).toBe(false);
  });
});
