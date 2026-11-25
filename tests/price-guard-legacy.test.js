/**
 * The reply paths outside the sales agent check prices too: the per-intent
 * reply writer, the clarifying and size questions, and the follow-up check-in.
 * The model is scripted to quote a price it was never given.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let reply = "";
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } };
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

const { generateReplyMessage, generateClarifyingQuestion, generateSizeQuestion } = await import(
  "../app/lib/automation.server"
);
const { generateFollowupMessage } = await import("../app/lib/followup.server");

const CHECKOUT = "https://shanesecaresllc.myshopify.com/a/go/5BSvWaFc";
const voice = { tone: "friendly", reply_language: "auto" };

beforeEach(() => {
  reply = "";
});

describe("per-intent reply writer", () => {
  it("corrects a misread price to the one it was given", async () => {
    reply = `The Pineapple Seamoss is $1,500 a jar. Grab it here: ${CHECKOUT}`;
    const text = await generateReplyMessage(voice, "Pineapple Seamoss", CHECKOUT, "price_request", "15.00 USD", null, "how much?");
    expect(text).toContain("$15.00 a jar");
    expect(text).not.toContain("1,500");
    expect(text).toContain(CHECKOUT);
  });

  it("removes a price it was never given and keeps the link", async () => {
    reply = `It's on sale for $9.99 today! Grab it here: ${CHECKOUT}`;
    const text = await generateReplyMessage(voice, "Pineapple Seamoss", CHECKOUT, "purchase", null, null, "I want it");
    expect(text).not.toContain("9.99");
    expect(text).toContain(CHECKOUT);
  });

  it("leaves a correct price alone", async () => {
    reply = `The Pineapple Seamoss is $15.00. Grab it here: ${CHECKOUT}`;
    const text = await generateReplyMessage(voice, "Pineapple Seamoss", CHECKOUT, "price_request", "15.00 USD", null, "how much?");
    expect(text).toBe(reply);
  });

  it("accepts a fee the merchant's own instruction states", async () => {
    reply = `It's 7.500 OMR and delivery to your home is 2 OMR. Order here: ${CHECKOUT}`;
    const text = await generateReplyMessage(
      { ...voice, custom_instruction: "Delivery: Oman home 2 OMR, office 1 OMR" },
      "Design 24",
      CHECKOUT,
      "price_request",
      "7.500 OMR",
      null,
      "how much?"
    );
    expect(text).toBe(reply);
  });
});

describe("replies written without product data", () => {
  it("strips an invented price from a clarifying question", async () => {
    reply = "Happy to help! Is it the $20 one you mean? Which product are you asking about?";
    const text = await generateClarifyingQuestion(voice, "how much is it", "price_request");
    expect(text).not.toContain("$20");
    expect(text).toContain("Which product are you asking about?");
  });

  it("falls back to the canned size question when nothing else is left", async () => {
    reply = "It's $20.";
    const text = await generateSizeQuestion(voice, "Hoodie", ["S", "M", "L"], "I want one");
    expect(text).toBe("Thanks for your interest in Hoodie! What size would you like? We have S, M, L.");
  });

  it("strips an invented price from a follow-up", async () => {
    reply = "Still thinking it over? It's only $20 today!";
    const text = await generateFollowupMessage({ tone: "casual" });
    expect(text).toBe("Still thinking it over?");
  });
});
