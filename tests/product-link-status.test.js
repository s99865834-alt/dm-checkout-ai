/**
 * A link must open something real. Until 29 Oct 2026 a checkout link was sent
 * for whatever variant a post was mapped to, so a deleted or sold-out variant
 * opened Shopify's "Link no longer exists" page (Love By Luna, sent twice), and
 * a product with no known variant got /cart/add?id={productId}, which Shopify
 * answers with 422.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { productLinkStatus, mappingProblemText } from "../app/lib/product-link-status";

const getProductLinkNodes = vi.fn();

vi.mock("../app/lib/shopify-data.server", () => ({
  getProductLinkNodes: (...a) => getProductLinkNodes(...a),
  getShopifyProductContextForReply: vi.fn(async () => null),
  getShopPrimaryDomainHost: vi.fn(async () => null),
}));
vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({ insert: async () => ({ error: null }) }) },
}));
vi.mock("../app/lib/discount-pool.server", () => ({ claimDiscountCode: vi.fn(async () => null) }));
vi.mock("../app/lib/logger.server", () => ({
  default: { debug: () => {}, warn: () => {}, error: () => {} },
}));

const { buildCheckoutLink, buildProductPageLink } = await import("../app/lib/links.server");
const { classifyLinkUrl, brokenLinkReason, getLinkProblems } = await import("../app/lib/link-health.server");

const SHOP = {
  id: "shop-1",
  shopify_domain: "lovebyluna.myshopify.com",
  store_context_json: { primaryDomain: { host: "lovebyluna.co" } },
};

const product = (overrides = {}) => ({
  id: "gid://shopify/Product/1",
  handle: "luna-set",
  status: "ACTIVE",
  onlineStoreUrl: "https://lovebyluna.co/products/luna-set",
  variants: {
    nodes: [
      { id: "gid://shopify/ProductVariant/10", availableForSale: false },
      { id: "gid://shopify/ProductVariant/11", availableForSale: true },
    ],
  },
  ...overrides,
});

const nodesFor = (node) => new Map([["1", node]]);

beforeEach(() => getProductLinkNodes.mockReset());

describe("productLinkStatus", () => {
  it("treats a deleted product as gone", () => {
    expect(productLinkStatus(null).state).toBe("gone");
  });

  it("treats a draft or archived product as gone", () => {
    expect(productLinkStatus(product({ status: "DRAFT" }))).toMatchObject({ state: "gone", reason: "unpublished" });
  });

  it("treats a product missing from the Online Store as gone", () => {
    expect(productLinkStatus(product({ onlineStoreUrl: null }))).toMatchObject({
      state: "gone",
      reason: "not_on_online_store",
    });
  });

  it("never swaps a sold-out mapped variant for a different one", () => {
    expect(productLinkStatus(product(), "gid://shopify/ProductVariant/10")).toMatchObject({
      state: "product_page",
      reason: "variant_sold_out",
    });
  });

  it("sends a deleted mapped variant to the product page", () => {
    expect(productLinkStatus(product(), "999")).toMatchObject({ state: "product_page", reason: "variant_deleted" });
  });

  it("picks the first variant that can be bought when none is mapped", () => {
    expect(productLinkStatus(product())).toMatchObject({ state: "ok", variantId: "gid://shopify/ProductVariant/11" });
  });

  it("calls a product with nothing in stock sold out", () => {
    const soldOut = product({ variants: { nodes: [{ id: "gid://shopify/ProductVariant/10", availableForSale: false }] } });
    expect(productLinkStatus(soldOut)).toMatchObject({ state: "product_page", reason: "sold_out" });
  });

  it("trusts a mapped variant past the first page it can see", () => {
    const many = product({
      variants: { nodes: Array.from({ length: 100 }, (_, i) => ({ id: `gid://shopify/ProductVariant/${i + 100}`, availableForSale: true })) },
    });
    expect(productLinkStatus(many, "5")).toMatchObject({ state: "ok", variantId: "gid://shopify/ProductVariant/5" });
  });

  it("explains every problem to the merchant", () => {
    for (const reason of ["deleted", "unpublished", "not_on_online_store", "variant_deleted", "variant_sold_out", "sold_out"]) {
      expect(mappingProblemText({ state: "gone", reason })).toBeTruthy();
    }
    expect(mappingProblemText({ state: "ok" })).toBeNull();
  });
});

describe("buildCheckoutLink checks the product first", () => {
  it("sends checkout for a variant that can be bought", async () => {
    getProductLinkNodes.mockResolvedValue(nodesFor(product()));
    const link = await buildCheckoutLink(SHOP, "gid://shopify/Product/1", "gid://shopify/ProductVariant/11");
    expect(new URL(link.url).pathname).toBe("/cart/11:1");
    expect(link.fallback).toBeNull();
  });

  it("sends the product page, keeping the variant, when the mapped variant is sold out", async () => {
    getProductLinkNodes.mockResolvedValue(nodesFor(product()));
    const link = await buildCheckoutLink(SHOP, "gid://shopify/Product/1", "gid://shopify/ProductVariant/10");
    const url = new URL(link.url);
    expect(url.host).toBe("lovebyluna.co");
    expect(url.pathname).toBe("/products/luna-set");
    expect(url.searchParams.get("variant")).toBe("10");
    expect(url.searchParams.get("ref")).toBe(`link_${link.linkId}`);
    expect(link.fallback).toBe("product_page");
  });

  it("sends the catalog when the product was deleted", async () => {
    getProductLinkNodes.mockResolvedValue(nodesFor(null));
    const link = await buildCheckoutLink(SHOP, "gid://shopify/Product/1", "gid://shopify/ProductVariant/10");
    expect(new URL(link.url).pathname).toBe("/collections/all");
    expect(link.fallback).toBe("browse");
  });

  it("sends the link unchanged when the product could not be checked", async () => {
    getProductLinkNodes.mockResolvedValue(null);
    const link = await buildCheckoutLink(SHOP, "gid://shopify/Product/1", "gid://shopify/ProductVariant/10");
    expect(new URL(link.url).pathname).toBe("/cart/10:1");
    expect(link.fallback).toBeNull();
  });

  it("never sends /cart/add with a product id", async () => {
    getProductLinkNodes.mockResolvedValue(null);
    const link = await buildCheckoutLink(SHOP, "gid://shopify/Product/1", null);
    expect(link.url).not.toContain("/cart/add");
    expect(new URL(link.url).pathname).toBe("/collections/all");
  });

  it("still rejects a malformed product id", async () => {
    await expect(buildCheckoutLink(SHOP, "not-an-id", null)).rejects.toThrow("Invalid product ID format");
  });
});

describe("sent-link health check", () => {
  it("classifies destinations by how they can be checked", () => {
    expect(classifyLinkUrl("https://x.co/cart/add?id=1&quantity=1")).toBe("cart_add");
    expect(classifyLinkUrl("https://x.co/cart/42:1?ref=link_a")).toBe("cart");
    expect(classifyLinkUrl("https://x.co/products/luna-set")).toBe("product");
    expect(classifyLinkUrl("https://x.co/collections/all")).toBe("page");
    expect(classifyLinkUrl("not a url")).toBeNull();
  });

  it("flags /cart/add with a product id without fetching anything", async () => {
    const fetchStatusFn = vi.fn();
    expect(await brokenLinkReason({ url: "https://x.co/cart/add?id=1" }, null, { fetchStatusFn })).toBe(
      "cart_add_with_product_id",
    );
    expect(fetchStatusFn).not.toHaveBeenCalled();
  });

  it("checks cart links through the Admin API and never fetches them", async () => {
    const fetchStatusFn = vi.fn();
    const link = { url: "https://x.co/cart/10:1", product_id: "gid://shopify/Product/1", variant_id: "10" };
    expect(await brokenLinkReason(link, nodesFor(product()), { fetchStatusFn })).toBe("variant_sold_out");
    expect(await brokenLinkReason(link, null, { fetchStatusFn })).toBeNull();
    expect(fetchStatusFn).not.toHaveBeenCalled();
  });

  it("flags a storefront page that 404s, and only definite failures", async () => {
    const link = { url: "https://markwattsart.com/collections/all." };
    expect(await brokenLinkReason(link, null, { fetchStatusFn: async () => 404 })).toBe("http_404");
    expect(await brokenLinkReason(link, null, { fetchStatusFn: async () => 429 })).toBeNull();
    expect(await brokenLinkReason(link, null, { fetchStatusFn: async () => null })).toBeNull();
  });
});

describe("getLinkProblems", () => {
  it("reports mapped posts and the default product that will not check out", async () => {
    getProductLinkNodes.mockResolvedValue(
      new Map([
        ["1", product()],
        ["2", null],
      ]),
    );
    const result = await getLinkProblems("lovebyluna.myshopify.com", {
      mappings: [
        { ig_media_id: "post-ok", product_id: "gid://shopify/Product/1", variant_id: "gid://shopify/ProductVariant/11" },
        { ig_media_id: "post-sold-out", product_id: "gid://shopify/Product/1", variant_id: "gid://shopify/ProductVariant/10" },
        { ig_media_id: "post-deleted", product_id: "gid://shopify/Product/2", variant_id: null },
      ],
      settings: { featured_product_id: "gid://shopify/Product/2", featured_variant_id: null },
    });
    expect(Object.keys(result.posts).sort()).toEqual(["post-deleted", "post-sold-out"]);
    expect(result.posts["post-deleted"].text).toContain("Map this post to another product");
    expect(result.defaultProduct.text).toContain("Pick another default product");
  });

  it("returns null rather than guessing when products cannot be checked", async () => {
    getProductLinkNodes.mockResolvedValue(null);
    const result = await getLinkProblems("lovebyluna.myshopify.com", {
      mappings: [{ ig_media_id: "p", product_id: "1" }],
    });
    expect(result).toBeNull();
  });
});

describe("buildProductPageLink checks the product first", () => {
  it("skips a product page that would 404", async () => {
    getProductLinkNodes.mockResolvedValue(nodesFor(product({ status: "ARCHIVED" })));
    expect(await buildProductPageLink(SHOP, "gid://shopify/Product/1", null, "luna-set")).toBeNull();
  });

  it("uses the live handle over a stale stored one", async () => {
    getProductLinkNodes.mockResolvedValue(nodesFor(product({ handle: "luna-set-v2" })));
    const link = await buildProductPageLink(SHOP, "gid://shopify/Product/1", null, "luna-set");
    expect(new URL(link.url).pathname).toBe("/products/luna-set-v2");
  });
});
