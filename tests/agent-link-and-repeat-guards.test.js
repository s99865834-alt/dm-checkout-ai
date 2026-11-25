/**
 * Two Tabcase failures from 22 Nov 2026, fixed for every store:
 *
 * - A customer named "ايباد برو 11 انش m1" and was asked to read the model
 *   number off the back of the iPad. What gets asked for again differs by
 *   store and language, so a draft reply is checked for it rather than
 *   matched against a word list.
 * - "كيف اطلب" ("how do I order") minted a checkout link and the reply went
 *   out without it.
 *
 * The model is scripted, so what is tested is the code around it.
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
            requests.push(structuredClone(params));
            const next = script.shift();
            if (!next) throw new Error("model called more times than scripted");
            return { choices: [{ message: next }] };
          },
        },
      };
    }
  },
}));

vi.mock("../app/lib/ai.server", () => ({ repeatsWhatCustomerSaid: vi.fn(async () => ({ repeats: false, what: null })) }));
vi.mock("../app/lib/store-context.server", () => ({ getStoreContextForReply: vi.fn(async () => null) }));
vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyStoreInfo: vi.fn(async () => null),
  getShopifyProductContextForReply: vi.fn(async () => null),
  buildStoreContextForAI: vi.fn(() => ({ text: "", urlMap: {} })),
  searchProductsByDomain: vi.fn(async () => []),
  getShopCollections: vi.fn(async () => []),
}));
vi.mock("../app/lib/storefront-mcp.server", () => ({ searchCatalogNormalized: vi.fn(async () => []) }));
vi.mock("../app/lib/links.server", () => ({
  buildCheckoutLink: vi.fn(async () => ({ url: "https://c3w5hj-y9.myshopify.com/cart/31:1", linkId: "pPjW9AYd" })),
  buildProductPageLink: vi.fn(),
  getTrackedLinkUrl: vi.fn(async (_shop, linkId) => `https://c3w5hj-y9.myshopify.com/a/go/${linkId}`),
  shortenUrlsInReply: vi.fn(async (_shop, _id, text) => text),
  getShopHomepageUrl: vi.fn(() => "https://c3w5hj-y9.myshopify.com"),
  getShopBrowseUrl: vi.fn(() => "https://c3w5hj-y9.myshopify.com/collections/all"),
  getShopCollectionUrl: vi.fn(),
}));

const { generateAgentReply } = await import("../app/lib/sales-agent.server");
const { repeatsWhatCustomerSaid } = await import("../app/lib/ai.server");
const { getTrackedLinkUrl } = await import("../app/lib/links.server");

const shop = { id: "shop-1", shopify_domain: "c3w5hj-y9.myshopify.com" };
const brandVoice = { tone: "friendly", reply_language: "auto" };
const say = (content) => ({ role: "assistant", content });
const linkCall = {
  role: "assistant",
  content: null,
  tool_calls: [
    { id: "t1", type: "function", function: { name: "get_checkout_link", arguments: '{"product_id":"gid://shopify/Product/31"}' } },
  ],
};
const LINK = "https://c3w5hj-y9.myshopify.com/a/go/pPjW9AYd";
const ASK_AGAIN = "لازم أتأكد من موديل جهازك بالضبط. لو تقدر تعطيني رقم الموديل اللي مكتوب ورا الايباد";

function run(text, earlier = []) {
  return generateAgentReply({
    shop,
    message: { id: "m9", text },
    intent: "product_question",
    brandVoice,
    threadContext: { messages: earlier },
    allowClarify: false,
  });
}

beforeEach(() => {
  script.length = 0;
  requests.length = 0;
  repeatsWhatCustomerSaid.mockClear();
  repeatsWhatCustomerSaid.mockResolvedValue({ repeats: false, what: null });
});

describe("asking for something the customer already gave", () => {
  it("rewrites the reply when the check says it asks again", async () => {
    repeatsWhatCustomerSaid.mockResolvedValueOnce({ repeats: true, what: "their iPad model" });
    script.push(say(ASK_AGAIN), linkCall, say(`كفر آيباد برو 11 متوفر، تقدر تطلبه من هنا: ${LINK}`));
    const result = await run("ايباد برو 11 انش m1", [{ id: "m8", channel: "dm", text: "عندكم كفرات ايباد" }]);
    expect(result.text).toContain(LINK);
    expect(result.text).not.toContain("رقم الموديل");
    expect(requests[1].messages.at(-1).content).toMatch(/You asked the customer for their iPad model/);
  });

  it("gives the check the whole conversation, oldest first, current message last", async () => {
    script.push(say("أي لون تفضل؟"));
    await run("ايباد برو 11 انش m1", [
      { id: "m8", channel: "dm", text: "برو" },
      { id: "m7", channel: "dm", text: "عندكم كفرات ايباد" },
    ]);
    expect(repeatsWhatCustomerSaid).toHaveBeenCalledWith({
      customerMessages: ["عندكم كفرات ايباد", "برو", "ايباد برو 11 انش m1"],
      reply: "أي لون تفضل؟",
    });
  });

  it("leaves the reply alone when the check says no", async () => {
    script.push(say("أي موديل آيباد عندك؟"));
    const result = await run("عندكم كفرات ايباد");
    expect(result.text).toBe("أي موديل آيباد عندك؟");
    expect(requests).toHaveLength(1);
  });

  it("does not check when the customer has given no specific detail to repeat", async () => {
    script.push(say("Which iPad model do you have?"));
    await run("How much for tab case?");
    expect(repeatsWhatCustomerSaid).not.toHaveBeenCalled();
  });

  it("does not check a reply that already links a product", async () => {
    script.push(linkCall, say(`تقدر تطلبه من هنا: ${LINK}`));
    await run("ايباد برو 11 انش m1");
    expect(repeatsWhatCustomerSaid).not.toHaveBeenCalled();
  });
});

describe("a minted link always reaches the customer", () => {
  it("appends a checkout link the reply left out", async () => {
    script.push(linkCall, say("تقدر تطلب من الرابط المرفق"));
    const result = await run("كيف اطلب");
    expect(result.text).toContain(LINK);
  });

  it("falls back to the link itself when the tracked short link cannot be read", async () => {
    getTrackedLinkUrl.mockResolvedValue(null);
    script.push(linkCall, say("تقدر تطلب من الرابط المرفق"));
    const result = await run("كيف اطلب");
    expect(result.text).toContain("https://c3w5hj-y9.myshopify.com/cart/31:1");
  });
});
