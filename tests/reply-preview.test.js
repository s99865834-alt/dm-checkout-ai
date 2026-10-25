/**
 * The pre-connection preview has to ask about something the merchant actually
 * stocks, and has to keep itself out of their analytics.
 *
 * The question comes from shops.store_context_json, which is populated about
 * five seconds after install. Reading a column that was never selected returns
 * undefined silently, which is how a previous feature came to report "not read
 * yet" for every shop while the data sat in the table, so the shape here is
 * asserted against a real cached payload.
 */
import { describe, it, expect } from "vitest";
import {
  suggestedPreviewQuestion,
  splitTextWithUrls,
  PREVIEW_FAILED_REASON,
} from "../app/lib/reply-preview";

// Exactly the shape stored for 3f24fb-2.myshopify.com on 23 Oct 2026.
const REAL_STORE_CONTEXT = {
  name: "Donna Henry",
  productsCount: 57,
  products: [
    {
      title: "Seductive Candle - Tiger Orchid & Woody Notes",
      handle: "candle-seductive-tiger-orchid-woody-notes",
      onlineStoreUrl: "https://donnahenry.co.uk/products/candle-seductive-tiger-orchid-woody-notes",
    },
  ],
};

describe("suggestedPreviewQuestion", () => {
  it("asks about a product the merchant really stocks", () => {
    expect(suggestedPreviewQuestion(REAL_STORE_CONTEXT)).toBe(
      "How much is the Seductive Candle - Tiger Orchid & Woody Notes?",
    );
  });

  it("falls back to a generic question rather than breaking the card", () => {
    const generic = "What do you sell?";
    expect(suggestedPreviewQuestion(null)).toBe(generic);
    expect(suggestedPreviewQuestion(undefined)).toBe(generic);
    expect(suggestedPreviewQuestion({})).toBe(generic);
    expect(suggestedPreviewQuestion({ products: [] })).toBe(generic);
    // A store context saved before products were cached.
    expect(suggestedPreviewQuestion({ products: null })).toBe(generic);
  });

  it("skips entries with no usable title", () => {
    expect(
      suggestedPreviewQuestion({ products: [{ handle: "no-title" }, { title: "Real Product" }] }),
    ).toBe("How much is the Real Product?");
    expect(suggestedPreviewQuestion({ products: [{ title: "   " }] })).toBe("What do you sell?");
  });

  it("trims a padded title", () => {
    expect(suggestedPreviewQuestion({ products: [{ title: "  Candle  " }] })).toBe(
      "How much is the Candle?",
    );
  });

  it("skips the gift card Shopify ships, which sorts first on most stores", () => {
    // Verified against dmteststore-2 on 24 Oct 2026: asking about the Gift Card
    // made the agent correctly ask which denomination the customer wanted and
    // mint no link, so the card demonstrated nothing clickable. Asking about
    // the next product returned "$949.95" plus a real tracked checkout link.
    expect(
      suggestedPreviewQuestion({
        products: [{ title: "Gift Card" }, { title: "The Videographer Snowboard" }],
      }),
    ).toBe("How much is the The Videographer Snowboard?");
    expect(
      suggestedPreviewQuestion({ products: [{ title: "gift card" }, { title: "Candle" }] }),
    ).toBe("How much is the Candle?");
  });

  it("still uses a gift card when it is the only product", () => {
    expect(suggestedPreviewQuestion({ products: [{ title: "Gift Card" }] })).toBe(
      "How much is the Gift Card?",
    );
  });
});

describe("splitTextWithUrls", () => {
  it("returns an empty list for empty or non-string input", () => {
    expect(splitTextWithUrls("")).toEqual([]);
    expect(splitTextWithUrls(null)).toEqual([]);
    expect(splitTextWithUrls(undefined)).toEqual([]);
  });

  it("keeps a reply with no URL as a single text run", () => {
    expect(splitTextWithUrls("It's $42.")).toEqual([{ type: "text", value: "It's $42." }]);
  });

  it("splits a tracked checkout URL out so the preview can hyperlink it", () => {
    expect(
      splitTextWithUrls("It's $42. Checkout: https://donnahenry.co.uk/a/go/AbCdEf12"),
    ).toEqual([
      { type: "text", value: "It's $42. Checkout: " },
      { type: "url", value: "https://donnahenry.co.uk/a/go/AbCdEf12" },
    ]);
  });

  it("does not swallow the period at the end of a sentence", () => {
    expect(splitTextWithUrls("Here: https://shop.example/a/go/AbCdEf12.")).toEqual([
      { type: "text", value: "Here: " },
      { type: "url", value: "https://shop.example/a/go/AbCdEf12" },
      { type: "text", value: "." },
    ]);
  });

  it("keeps two URLs as separate link runs", () => {
    const parts = splitTextWithUrls(
      "This one https://a.example/a/go/aaaaaaaa or https://b.example/a/go/bbbbbbbb",
    );
    expect(parts.filter((p) => p.type === "url").map((p) => p.value)).toEqual([
      "https://a.example/a/go/aaaaaaaa",
      "https://b.example/a/go/bbbbbbbb",
    ]);
  });
});

describe("preview link marking", () => {
  it("uses a failed_reason value, which is what analytics filters on", () => {
    // shop_analytics_totals scopes on `ls.failed_reason is null`, so any
    // non-null value keeps the row out of "checkout links sent". The redirect
    // in click-redirect.server.js selects on link_id alone, so the link still
    // resolves. Changing this constant to null would silently start counting
    // previews as real sends.
    expect(PREVIEW_FAILED_REASON).toBeTruthy();
    expect(typeof PREVIEW_FAILED_REASON).toBe("string");
  });
});
