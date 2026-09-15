import { describe, it, expect } from "vitest";
import {
  isShopifyAutomatedReviewShop,
  excludeAutomatedReviewShops,
  isMalformedShopifyHostError,
  isShopNotFoundError,
} from "../app/lib/shopify-review-shop";

describe("isShopifyAutomatedReviewShop", () => {
  it.each([
    "app-review-248a0b56-r101425-a0-primary.myshopify.com",
    "app-review-248a0b56-r101425-a0-victim.myshopify.com",
    "cross-shop-missing-abc123.myshopify.com",
    "APP-REVIEW-FFFF-r1-a0-primary.myshopify.com",
  ])("detects %s", (domain) => {
    expect(isShopifyAutomatedReviewShop(domain)).toBe(true);
  });

  it.each([
    "dmteststore-2.myshopify.com",
    "love-by-luna.myshopify.com",
    "review-my-art.myshopify.com",
    "app-review-not-shopify.com",
    "",
    null,
    undefined,
  ])("leaves %s alone", (domain) => {
    expect(isShopifyAutomatedReviewShop(domain)).toBe(false);
  });
});

describe("excludeAutomatedReviewShops", () => {
  it("drops review shops and keeps merchant rows", () => {
    const shops = [
      { shopify_domain: "love-by-luna.myshopify.com" },
      { shopify_domain: "app-review-248a0b56-r101425-a0-primary.myshopify.com" },
      { shopify_domain: "dmteststore-2.myshopify.com" },
    ];
    expect(excludeAutomatedReviewShops(shops).map((s) => s.shopify_domain)).toEqual([
      "love-by-luna.myshopify.com",
      "dmteststore-2.myshopify.com",
    ]);
  });
});

describe("isMalformedShopifyHostError", () => {
  it("matches Node's Invalid URL TypeError", () => {
    const err = new TypeError("Invalid URL");
    err.code = "ERR_INVALID_URL";
    expect(isMalformedShopifyHostError(errorWithCause(err))).toBe(true);
    expect(isMalformedShopifyHostError(err)).toBe(true);
  });

  it("does not swallow thrown Responses or unrelated errors", () => {
    expect(isMalformedShopifyHostError(new Response("nope", { status: 401 }))).toBe(false);
    expect(isMalformedShopifyHostError(new Error("shop not found"))).toBe(false);
    expect(isMalformedShopifyHostError(null)).toBe(false);
  });
});

describe("isShopNotFoundError", () => {
  it("matches the GraphQL client 404 the scanner produces", () => {
    expect(isShopNotFoundError({ message: "GraphQL Client: Not Found", networkStatusCode: 404 })).toBe(true);
    expect(isShopNotFoundError({ message: "404 Not Found" })).toBe(true);
    expect(isShopNotFoundError({ message: "401 Unauthorized" })).toBe(false);
  });
});

function errorWithCause(cause) {
  const wrap = new Error("authenticate.admin failed");
  wrap.cause = cause;
  return wrap;
}
