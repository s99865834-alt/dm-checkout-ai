/**
 * Guards the class of bug where the model writes a bracketed stand-in instead
 * of calling a link tool. The first "must be stripped" case was sent to a real
 * customer on Sep 1: it slipped past the URL allowlist (nothing to strip) and
 * past promisesLinkWithoutUrl (no trailing colon, no literal "here's the
 * link"). The "must survive" cases are ordinary bracketed copy that shares the
 * shape and has to keep working.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../app/lib/db.server", () => ({ getStoredStoreContext: vi.fn() }));
vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyStoreInfo: vi.fn(),
  getShopifyProductContextForReply: vi.fn(),
  buildStoreContextForAI: vi.fn(),
  searchProductsByDomain: vi.fn(),
}));
vi.mock("../app/lib/storefront-mcp.server", () => ({ searchCatalogNormalized: vi.fn() }));
vi.mock("../app/lib/links.server", () => ({
  buildCheckoutLink: vi.fn(),
  buildProductPageLink: vi.fn(),
  getTrackedLinkUrl: vi.fn(),
  shortenUrlsInReply: vi.fn(),
  getShopHomepageUrl: vi.fn(),
}));

const { sanitizeReplyText } = await import("../app/lib/sales-agent.server");

const NO_URLS = [];

describe("sanitizeReplyText, link placeholders", () => {
  const mustBeStripped = [
    "If you want to browse everything, here's the full collection: [store's all-products link]",
    "Grab yours here: [link]",
    "[insert link here]",
    "Full details on the [product page]",
    "Ready when you are: [checkout link]",
    "More on our [website]",
    "See it at [URL]",
  ];

  for (const reply of mustBeStripped) {
    it(`strips: ${reply.slice(0, 50)}`, () => {
      const { text, strippedPlaceholder } = sanitizeReplyText(reply, NO_URLS);
      expect(strippedPlaceholder).toBe(true);
      expect(text).not.toMatch(/\[/);
    });
  }

  const mustSurvive = [
    "That one is [SOLD OUT] right now, sorry!",
    "This is the [Limited Edition] run.",
    "We have the [Bundle] and the single.",
    "Happy to help, just say the word.",
  ];

  for (const reply of mustSurvive) {
    it(`leaves alone: ${reply.slice(0, 50)}`, () => {
      const { text, strippedPlaceholder } = sanitizeReplyText(reply, NO_URLS);
      expect(strippedPlaceholder).toBe(false);
      expect(text).toBe(reply);
    });
  }

  it("expands a real markdown link rather than treating it as a placeholder", () => {
    const allowed = ["https://shop.example.com/products/tee"];
    const { text, strippedPlaceholder, strippedUrl } = sanitizeReplyText(
      "Grab it here: [product page](https://shop.example.com/products/tee)",
      allowed
    );
    expect(strippedPlaceholder).toBe(false);
    expect(strippedUrl).toBe(false);
    expect(text).toBe("Grab it here: product page https://shop.example.com/products/tee");
  });

  it("leaves the lead-in intact so the link guarantee fires downstream", () => {
    // promisesLinkWithoutUrl keys off a trailing colon, and the guarantee then
    // appends a real URL. Stripping the carrier too would silently drop the
    // link the model was reaching for.
    const { text } = sanitizeReplyText(
      "If you want to browse everything, here's the full collection: [store's all-products link]",
      NO_URLS
    );
    expect(text).toBe("If you want to browse everything, here's the full collection:");
  });

  it("still reports a stripped non-tool URL separately", () => {
    const { strippedUrl, strippedPlaceholder } = sanitizeReplyText(
      "Try https://made-up.example.com/thing",
      NO_URLS
    );
    expect(strippedUrl).toBe(true);
    expect(strippedPlaceholder).toBe(false);
  });
});
