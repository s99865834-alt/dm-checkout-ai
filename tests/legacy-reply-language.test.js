/**
 * The per-intent reply writer answers every comment-to-DM reply, so it needs
 * the same language and photo handling as the sales agent: the customer's
 * language from the thread when their message has none, one rewrite when the
 * reply comes back in another language, and photos shown as photos.
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
            return { choices: [{ message: { content: script.shift() ?? "" } }] };
          },
        },
      };
    }
  },
}));
vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({}), rpc: async () => ({ data: null, error: null }) },
}));
vi.mock("../app/shopify.server", () => ({
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
}));
vi.mock("../app/lib/db.server", () => ({
  getShopPlanAndUsage: vi.fn(),
  incrementUsage: vi.fn(),
  logLinkSent: vi.fn(),
  deleteLinkSent: vi.fn(),
  markReplyUndelivered: vi.fn(),
  alreadyRepliedToMessage: vi.fn(),
  alreadyRepliedToExternalMessage: vi.fn(),
  claimMessageReply: vi.fn(),
  claimCommentReply: vi.fn(),
  isHumanTakeoverActive: vi.fn(),
  getProductMappings: vi.fn(),
  getSettings: vi.fn(),
  getBrandVoice: vi.fn(),
  getRecentConversationContext: vi.fn(),
  getStoredStoreContext: vi.fn(),
  getStoredStoreContextWithAge: vi.fn(),
  saveStoredStoreContext: vi.fn(),
}));
vi.mock("../app/lib/meta.server", () => ({
  sendInstagramPrivateReply: vi.fn(),
  sendInstagramDm: vi.fn(),
  getInstagramMediaByIds: vi.fn(),
}));
vi.mock("../app/lib/queue.server", () => ({ canSendForShop: vi.fn(), sendDmNow: vi.fn() }));
vi.mock("../app/lib/sales-agent.server", () => ({
  generateAgentReply: vi.fn(async () => null),
  isExplicitLinkRequest: () => false,
  REPLY_MODEL: "test-model",
  completionParamsForModel: (_model, params) => params,
}));

const { generateReplyMessage } = await import("../app/lib/automation.server");

const CHECKOUT = "https://c3w5hj-y9.myshopify.com/a/go/abc123";
const voice = { tone: "friendly", reply_language: "auto", custom_instruction: "رد بلهجة عمانية ودودة" };
const englishThread = { recentMessages: [{ channel: "dm", text: "How much for tab case?" }] };

function reply(originalMessage, channelContext) {
  return generateReplyMessage(voice, "iPad Case", CHECKOUT, "purchase", null, null, originalMessage, null, channelContext);
}

beforeEach(() => {
  script.length = 0;
  requests.length = 0;
});

describe("per-intent reply language", () => {
  it("uses the thread's language when the message is only a model name", async () => {
    script.push(`Here you go: ${CHECKOUT}`);
    await reply("A16 ipad", englishThread);
    expect(requests[0].messages[1].content).toMatch(/has been writing to you in English/);
  });

  it("rewrites once when the reply comes back in another language", async () => {
    script.push(`تقدر تطلب كفرك من هنا: ${CHECKOUT}`, `You can order your case here: ${CHECKOUT}`);
    const text = await reply("A16 ipad", englishThread);
    expect(text).toBe(`You can order your case here: ${CHECKOUT}`);
    expect(requests).toHaveLength(2);
  });

  it("keeps an Arabic reply to an Arabic customer", async () => {
    script.push(`تقدر تطلب كفرك من هنا: ${CHECKOUT}`);
    const text = await reply("ابي كفر لايباد برو", null);
    expect(text).toBe(`تقدر تطلب كفرك من هنا: ${CHECKOUT}`);
    expect(requests).toHaveLength(1);
  });
});

describe("per-intent photos", () => {
  it("shows photos in the thread and tells the model it cannot see them", async () => {
    script.push(`Which design do you mean? ${CHECKOUT}`);
    await reply("Are these available?", {
      recentMessages: [{ channel: "dm", text: null, content_type: "image", attachment_meta: { types: ["image"] } }],
    });
    const prompt = requests[0].messages[1].content;
    expect(prompt).toContain("[sent a photo, which you cannot see]");
    expect(prompt).toMatch(/never ask them to send a photo/);
  });
});
