/**
 * The sales agent's three Tabcase failures from Nov 2026, replayed with the
 * model scripted to make each mistake, so what is tested is the code around
 * it:
 *
 * - "How much for tab case?" then "A16 ipad", answered in Arabic.
 * - Two photos and "are these two available?", answered "send me a photo".
 * - "A16 ipad" offered "Design 16", which shares only the number.
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
  buildCheckoutLink: vi.fn(),
  buildProductPageLink: vi.fn(),
  getTrackedLinkUrl: vi.fn(),
  shortenUrlsInReply: vi.fn(async (_shop, _id, text) => text),
  getShopHomepageUrl: vi.fn(() => "https://c3w5hj-y9.myshopify.com"),
  getShopBrowseUrl: vi.fn(() => "https://c3w5hj-y9.myshopify.com/collections/all"),
  getShopCollectionUrl: vi.fn(),
}));

const { generateAgentReply } = await import("../app/lib/sales-agent.server");
const { searchCatalogNormalized } = await import("../app/lib/storefront-mcp.server");

const shop = { id: "shop-1", shopify_domain: "c3w5hj-y9.myshopify.com" };
// Tabcase's real instruction is Arabic, which is what pulled the reply into Arabic.
const brandVoice = { tone: "friendly", reply_language: "auto", custom_instruction: "رد بلهجة عمانية ودودة" };
const say = (content) => ({ role: "assistant", content });

function run(message, threadMessages = []) {
  return generateAgentReply({
    shop,
    message,
    intent: "product_question",
    brandVoice,
    threadContext: { messages: threadMessages },
    allowClarify: false,
  });
}

beforeEach(() => {
  script.length = 0;
  requests.length = 0;
});

describe("reply language", () => {
  const thread = [{ id: "m1", channel: "dm", text: "How much for tab case?" }];

  it("tells the model the customer has been writing in English", async () => {
    script.push(say("We have iPad cases in lots of designs. Which iPad model do you have?"));
    await run({ id: "m2", text: "A16 ipad" }, thread);
    expect(requests[0].messages[0].content).toMatch(/has been writing to you in English/);
  });

  it("rewrites an Arabic reply to an English customer", async () => {
    script.push(
      say("متوفر عندنا كفرات للآيباد بتصاميم كثيرة، أي موديل آيباد عندك عشان أساعدك؟"),
      say("We have iPad cases in lots of designs. Which iPad model do you have?")
    );
    const result = await run({ id: "m2", text: "A16 ipad" }, thread);
    expect(result.text).toBe("We have iPad cases in lots of designs. Which iPad model do you have?");
    expect(requests[1].messages.at(-1).content).toMatch(/ENTIRE reply in English/);
  });

  it("leaves an Arabic reply to an Arabic customer alone", async () => {
    const reply = "متوفر عندنا كفرات لآيباد برو 11 M1، تبي أرسل لك رابط الطلب؟";
    script.push(say(reply));
    const result = await run({ id: "m2", text: "ايباد برو 11 انش m1" });
    expect(result.text).toBe(reply);
    expect(requests).toHaveLength(1);
  });
});

describe("photos the model cannot see", () => {
  const thread = [{ id: "m1", channel: "dm", text: null, content_type: "image", attachment_meta: { types: ["image", "image"] } }];
  const message = { id: "m2", text: "اريد هذيلا الكفرين لكن ما حصلتهم في الموقع هل متوفرات؟" };

  it("shows the model that photos were sent", async () => {
    script.push(say("حياك الله! شو اسم التصميمين أو رقمهم عشان أشيك لك؟"));
    await run(message, thread);
    expect(requests[0].messages[1].content).toContain("[sent 2 photos, which you cannot see]");
  });

  it("rewrites a reply that asks for the photo they already sent", async () => {
    script.push(
      say("حياك الله! ممكن ترسل لي صورة أو اسم الكفرين؟"),
      say("حياك الله! شو اسم التصميمين أو رقمهم عشان أشيك لك؟")
    );
    const result = await run(message, thread);
    expect(result.text).toBe("حياك الله! شو اسم التصميمين أو رقمهم عشان أشيك لك؟");
    expect(requests[1].messages.at(-1).content).toMatch(/already sent photos/);
  });

  it("does not object to a photo request when no photo was sent", async () => {
    script.push(say("Could you send me a picture of the case you saw?"));
    const result = await run({ id: "m2", text: "Do you have the case I saw on your page?" });
    expect(result.text).toBe("Could you send me a picture of the case you saw?");
    expect(requests).toHaveLength(1);
  });
});

describe("a code the customer wrote", () => {
  const search = {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "t1", type: "function", function: { name: "search_products", arguments: '{"query":"A16 ipad"}' } }],
  };

  it("tells the model no result has the code, and shows each product's options", async () => {
    searchCatalogNormalized.mockResolvedValueOnce([
      {
        id: "gid://shopify/Product/16",
        title: "iPad Case – Design 16",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "iPad 10", price: "7.500 OMR" }, { id: "gid://shopify/ProductVariant/2", title: 'Pro 11" M4', price: "7.500 OMR" }] },
      },
    ]);
    script.push(search, say("Which iPad do you have exactly? Our cases come for iPad 10 and Pro 11 M4."));
    await run({ id: "m2", text: "A16 ipad" });
    const toolResult = JSON.parse(requests[1].messages.find((m) => m.role === "tool").content);
    expect(toolResult.results[0]).toMatchObject({ has_what_they_named: false, options: ["iPad 10", 'Pro 11" M4'] });
    expect(toolResult.note).toMatch(/"A16"/);
  });

  it("marks a product whose options do carry the code", async () => {
    searchCatalogNormalized.mockResolvedValueOnce([
      {
        id: "gid://shopify/Product/24",
        title: "iPad Case – Design 24",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/3", title: "iPad (A16)", price: "7.500 OMR" }] },
      },
    ]);
    script.push(search, say("Design 24 comes for the iPad A16. Want the link?"));
    await run({ id: "m2", text: "A16 ipad" });
    const toolResult = JSON.parse(requests[1].messages.find((m) => m.role === "tool").content);
    expect(toolResult.results[0].has_what_they_named).toBe(true);
    expect(toolResult.note).toBeUndefined();
  });
});
