/**
 * The UCP catalog returns prices as integers in the currency's minor units.
 * The search tool used to hand that integer to the model as the price, so on
 * Nov 11 a $15.00 sea moss jar was quoted as "$1,500" and on Nov 24 a 7.500
 * OMR iPad case as "75 OMR". The payloads below are the shapes those two
 * stores' catalogs return.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatMcpPrice, searchCatalogNormalized } from "../app/lib/storefront-mcp.server";

describe("formatMcpPrice", () => {
  it("converts USD minor units to dollars", () => {
    expect(formatMcpPrice({ amount: 1500, currency: "USD" })).toBe("15.00 USD");
    expect(formatMcpPrice({ amount: 3499, currency: "USD" })).toBe("34.99 USD");
  });

  it("uses three decimals for the Omani rial", () => {
    expect(formatMcpPrice({ amount: 7500, currency: "OMR" })).toBe("7.500 OMR");
    expect(formatMcpPrice({ amount: 5900, currency: "OMR" })).toBe("5.900 OMR");
  });

  it("leaves zero-decimal currencies whole", () => {
    expect(formatMcpPrice({ amount: 1500, currency: "JPY" })).toBe("1500 JPY");
  });

  it("accepts the amount as a numeric string", () => {
    expect(formatMcpPrice({ amount: "8500", currency: "omr" })).toBe("8.500 OMR");
  });

  it("keeps an amount that is already in major units", () => {
    expect(formatMcpPrice({ amount: "15.00", currency: "USD" })).toBe("15.00 USD");
    expect(formatMcpPrice("15.00")).toBe("15.00");
  });

  it("returns null instead of guessing the scale", () => {
    expect(formatMcpPrice({ amount: 1500 })).toBeNull();
    expect(formatMcpPrice({ amount: 1500, currency: "NOTACODE" })).toBeNull();
    expect(formatMcpPrice({ amount: 12.5, currency: "USD" })).toBeNull();
    expect(formatMcpPrice({ currency: "USD" })).toBeNull();
    expect(formatMcpPrice(null)).toBeNull();
  });
});

describe("searchCatalogNormalized prices", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCatalog(products) {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: JSON.stringify({ products }) }] },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "application/json" } }))
    );
  }

  it("gives the model the real price for a three-decimal currency", async () => {
    stubCatalog([
      {
        id: "gid://shopify/Product/1",
        title: "iPad Case – Design 24",
        price_range: { min: { amount: 7500, currency: "OMR" }, max: { amount: 7500, currency: "OMR" } },
        variants: [{ id: "gid://shopify/ProductVariant/11", title: "iPad Pro 12.9", price: { amount: 7500, currency: "OMR" } }],
      },
    ]);
    const [product] = await searchCatalogNormalized("c3w5hj-y9.myshopify.com", "Design 24");
    expect(product.variants.nodes[0].price).toBe("7.500 OMR");
  });

  it("gives the model dollars, not cents", async () => {
    stubCatalog([
      {
        id: "gid://shopify/Product/2",
        title: "Pineapple Seamoss",
        variants: [{ id: "gid://shopify/ProductVariant/22", title: "Small 8oz", price: { amount: 1500, currency: "USD" } }],
      },
    ]);
    const [product] = await searchCatalogNormalized("shanesecaresllc.myshopify.com", "Pineapple Seamoss");
    expect(product.variants.nodes[0].price).toBe("15.00 USD");
  });
});
