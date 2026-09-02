/**
 * A story reply is the surface the Pro default product sells on, and the only
 * link that can credit the resulting order is a checkout link: it sets the
 * attributes[ref] cart attribute, so it still attributes if the customer buys
 * in a later session, and pdp_ ids are filtered out of the links-sent KPI
 * entirely (see checkout-link-id.js).
 *
 * On Sep 1 a real story reply ("this is sick!") got a pdp_ link, because the
 * prompt read that as admiration rather than buying intent and the tool
 * description offered the product page for exactly that case. The prompt now
 * asks for a checkout link, but a prompt is a request. This guards the part
 * that isn't: on a story the product-page tool is not on the menu.
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

const { toolsForSurface } = await import("../app/lib/sales-agent.server");

const names = (storyContext) => toolsForSurface(storyContext).map((t) => t.function.name);

describe("which link tools the agent is offered", () => {
  it("offers both link tools in a normal DM", () => {
    const offered = names(null);
    expect(offered).toContain("get_checkout_link");
    expect(offered).toContain("get_product_page_link");
  });

  it.each(["story_reply", "story_mention"])("withholds the product page link on a %s", (kind) => {
    const offered = names({ kind, productName: "The Complete Snowboard" });
    expect(offered).not.toContain("get_product_page_link");
    expect(offered).toContain("get_checkout_link");
  });

  // Withholding one tool must not cost the agent the ability to confirm the
  // default product before linking it, which is what stops it selling the
  // wrong thing on a surface it cannot see.
  it("still offers the lookup tools on a story", () => {
    const offered = names({ kind: "story_reply", productName: "The Complete Snowboard" });
    expect(offered).toContain("search_products");
    expect(offered).toContain("get_product_details");
    expect(offered).toContain("get_store_info");
  });

  it("does not mutate the shared tool list", () => {
    const before = names(null).length;
    names({ kind: "story_reply" });
    expect(names(null).length).toBe(before);
  });
});
