/**
 * The sales agent may only send a price a tool returned in the same turn.
 *
 * Tabcase, 24 Nov 2026: search_products returned Design 24 and Design 32 at
 * 7.500 OMR, and the reply below told the customer "75 ر.ع" each. The model
 * here is scripted to make that exact mistake, and to repeat it when asked to
 * correct itself, so what is tested is the code, not the model.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const script = [];
const requests = [];
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (params) => {
            requests.push(params);
            const next = script.shift();
            if (!next) throw new Error("model called more times than scripted");
            return { choices: [{ message: next }] };
          },
        },
      };
    }
  },
}));

vi.mock("../app/lib/store-context.server", () => ({ getStoreContextForReply: vi.fn(async () => null) }));
vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyStoreInfo: vi.fn(async () => null),
  getShopifyProductContextForReply: vi.fn(async () => null),
  buildStoreContextForAI: vi.fn(() => ({ text: "", urlMap: {} })),
  searchProductsByDomain: vi.fn(async () => []),
  getShopCollections: vi.fn(async () => []),
}));
vi.mock("../app/lib/storefront-mcp.server", () => ({ searchCatalogNormalized: vi.fn() }));
vi.mock("../app/lib/links.server", () => ({
  buildCheckoutLink: vi.fn(async (_shop, gid) => ({
    url: `https://c3w5hj-y9.myshopify.com/cart/${gid.split("/").pop()}:1`,
    linkId: gid.endsWith("/24") ? "c5UbZhpT" : "ehW3nC3W",
  })),
  buildProductPageLink: vi.fn(),
  getTrackedLinkUrl: vi.fn(async (_shop, linkId) => `https://c3w5hj-y9.myshopify.com/a/go/${linkId}`),
  shortenUrlsInReply: vi.fn(async (_shop, _id, text) => text),
  getShopHomepageUrl: vi.fn(() => "https://c3w5hj-y9.myshopify.com"),
  getShopBrowseUrl: vi.fn(() => "https://c3w5hj-y9.myshopify.com/collections/all"),
  getShopCollectionUrl: vi.fn(),
}));

const { generateAgentReply } = await import("../app/lib/sales-agent.server");
const { searchCatalogNormalized } = await import("../app/lib/storefront-mcp.server");

const TABCASE_REPLY =
  "متوفر عندنا كفرات فاخرة تناسب آيباد برو 12.9، مثل Design 24 و Design 32 وكل واحد بسعر 75 ر.ع. تقدر تطلب من الروابط:\nhttps://c3w5hj-y9.myshopify.com/a/go/c5UbZhpT\nأو\nhttps://c3w5hj-y9.myshopify.com/a/go/ehW3nC3W\n\nالتوصيل لعمان للبيت 2 ر.ع، وللمكتب 1 ر.ع، وللإمارات 4 ر.ع.";

const shop = { id: "shop-1", shopify_domain: "c3w5hj-y9.myshopify.com" };
const message = { id: "msg-1", text: "عندكم كفرات لآيباد برو 12.9؟ كم السعر" };
const brandVoice = {
  tone: "friendly",
  reply_language: "auto",
  custom_instruction: "- التوصيل: عمان للبيت 2 ر.ع، عمان للمكتب 1 ر.ع، الإمارات 4 ر.ع.",
};

const toolCall = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const searchCall = {
  role: "assistant",
  content: null,
  tool_calls: [toolCall("t1", "search_products", { query: "iPad Pro 12.9" })],
};
const linkCalls = {
  role: "assistant",
  content: null,
  tool_calls: [
    toolCall("t2", "get_checkout_link", { product_id: "gid://shopify/Product/24" }),
    toolCall("t3", "get_checkout_link", { product_id: "gid://shopify/Product/32" }),
  ],
};

function run() {
  return generateAgentReply({ shop, message, intent: "price_request", brandVoice, threadContext: null, allowClarify: false });
}

beforeEach(() => {
  script.length = 0;
  requests.length = 0;
  searchCatalogNormalized.mockResolvedValue([
    { id: "gid://shopify/Product/24", title: "iPad Case – Design 24", variants: { nodes: [{ id: "gid://shopify/ProductVariant/241", price: "7.500 OMR" }] } },
    { id: "gid://shopify/Product/32", title: "iPad Case – Design 32", variants: { nodes: [{ id: "gid://shopify/ProductVariant/321", price: "7.500 OMR" }] } },
  ]);
});

describe("sales agent price guarantee", () => {
  it("sends the real price when the model misreads it twice", async () => {
    script.push(searchCall, linkCalls, { role: "assistant", content: TABCASE_REPLY }, { role: "assistant", content: TABCASE_REPLY });
    const result = await run();
    expect(result.text).toContain("بسعر 7.500 ر.ع");
    expect(result.text).not.toMatch(/(?<![\d.])75 ر\.ع/);
    expect(result.text).toContain("للبيت 2 ر.ع");
    expect(result.text).toContain("https://c3w5hj-y9.myshopify.com/a/go/c5UbZhpT");
  });

  it("tells the model which prices are real when it asks for a rewrite", async () => {
    script.push(searchCall, linkCalls, { role: "assistant", content: TABCASE_REPLY }, { role: "assistant", content: TABCASE_REPLY });
    await run();
    const correction = requests[3].messages.at(-1).content;
    expect(correction).toContain("75 ر.ع");
    expect(correction).toContain("iPad Case – Design 24: 7.500 OMR");
  });

  it("uses the model's own rewrite when it gets the price right", async () => {
    const fixed = TABCASE_REPLY.replace("بسعر 75 ر.ع", "بسعر 7.5 ر.ع");
    script.push(searchCall, linkCalls, { role: "assistant", content: TABCASE_REPLY }, { role: "assistant", content: fixed });
    const result = await run();
    expect(result.text).toContain("بسعر 7.5 ر.ع");
  });

  it("keeps the links when the rewrite drops them", async () => {
    script.push(searchCall, linkCalls, { role: "assistant", content: TABCASE_REPLY }, { role: "assistant", content: "كل واحد بسعر 7.5 ر.ع." });
    const result = await run();
    expect(result.text).toContain("بسعر 7.5 ر.ع");
    expect(result.text).toContain("https://c3w5hj-y9.myshopify.com/a/go/c5UbZhpT");
    expect(result.text).toContain("https://c3w5hj-y9.myshopify.com/a/go/ehW3nC3W");
  });

  it("does not let a price out that no tool returned", async () => {
    script.push({ role: "assistant", content: "It's only $20!" }, { role: "assistant", content: "It's only $20!" });
    expect(await run()).toBeNull();
  });

  it("sends a correct reply untouched, with no corrective pass", async () => {
    const good = TABCASE_REPLY.replace("بسعر 75 ر.ع", "بسعر 7.500 ر.ع");
    script.push(searchCall, linkCalls, { role: "assistant", content: good });
    const result = await run();
    expect(result.text).toBe(good);
    expect(requests).toHaveLength(3);
  });
});
