/**
 * Reply-path tests for DMs that carry no text (handleNonTextDm).
 *
 * Instagram sends plenty of DMs with an empty body: a forwarded post, a heart,
 * a photo. parseMessageEvent read `text` only, so all of them were logged with
 * a null body and then dropped by the text gate in the webhook. That silently
 * discarded 76 real customer messages across live stores, 41% of one
 * merchant's entire DM volume, including the single highest-intent signal
 * Instagram delivers: a customer forwarding a product into the thread.
 *
 * This is a brand new send path pointed at live merchants, so the rules it must
 * not break are pinned here: never guess a product, never reply to media we
 * cannot see, and never talk over the owner.
 *
 * As with the comment tests, the real pipeline runs; only external services are
 * mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "Thanks for sharing that! Here it is:" } }],
          }),
        },
      };
    }
  },
}));

vi.mock("../app/lib/supabase.server", () => {
  function makeChain() {
    const result = { data: null, error: null, count: 0 };
    const chain = {};
    for (const m of [
      "select", "insert", "update", "upsert", "delete", "eq", "neq", "gt",
      "gte", "lt", "lte", "in", "is", "not", "or", "like", "ilike", "match",
      "contains", "order", "limit", "range", "single", "maybeSingle",
    ]) {
      chain[m] = () => chain;
    }
    chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return chain;
  }
  return { default: { from: () => makeChain(), rpc: async () => ({ data: null, error: null }) } };
});

vi.mock("../app/shopify.server", () => ({
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
}));

vi.mock("../app/lib/db.server", () => ({
  getShopPlanAndUsage: vi.fn(),
  incrementUsage: vi.fn(),
  logLinkSent: vi.fn(async () => ({ id: "row-1" })),
  deleteLinkSent: vi.fn(),
  markReplyUndelivered: vi.fn(),
  getStoredStoreContextWithAge: vi.fn(async () => ({ context: null, stale: false })),
  saveStoredStoreContext: vi.fn(),
  alreadyRepliedToMessage: vi.fn(async () => false),
  alreadyRepliedToExternalMessage: vi.fn(async () => false),
  claimMessageReply: vi.fn(async () => true),
  claimCommentReply: vi.fn(async () => true),
  isHumanTakeoverActive: vi.fn(async () => false),
  getProductMappings: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({ dm_automation_enabled: true })),
  getBrandVoice: vi.fn(async () => ({ tone: "friendly" })),
  getRecentConversationContext: vi.fn(async () => ({ messages: [], links: [] })),
  getStoredStoreContext: vi.fn(async () => null),
}));

vi.mock("../app/lib/meta.server", () => ({
  sendInstagramPrivateReply: vi.fn(async () => ({ message_id: "sent-1" })),
  sendInstagramDm: vi.fn(async () => ({ message_id: "sent-2" })),
}));

vi.mock("../app/lib/shopify-data.server", () => ({
  getShopifyProductInfo: vi.fn(async () => ({ productName: "Test Product", productPrice: "25 USD" })),
  buildStoreContextForAI: vi.fn(async () => ""),
  getShopifyProductContextForReply: vi.fn(async () => null),
  buildProductContextForAI: vi.fn(() => ({ text: "" })),
  getShopifyStoreInfo: vi.fn(async () => null),
  searchProductsByDomain: vi.fn(async () => []),
  detectSizeOption: vi.fn(() => null),
  resolveVariantBySize: vi.fn(() => null),
  getShopPrimaryDomainHost: vi.fn(async () => null),
}));

vi.mock("../app/lib/storefront-mcp.server", () => ({
  searchCatalogNormalized: vi.fn(async () => []),
  resolveVariantViaMcp: vi.fn(async () => null),
}));

vi.mock("../app/lib/queue.server", () => ({
  canSendForShop: vi.fn(async () => true),
  sendDmNow: vi.fn(async () => ({ sent: true })),
}));

vi.mock("../app/lib/sales-agent.server", () => ({
  generateAgentReply: vi.fn(async () => null),
  isExplicitLinkRequest: (t) => /\blink\b/i.test(t || ""),
  REPLY_MODEL: "test-model",
  completionParamsForModel: (_model, params) => params,
}));

import { handleNonTextDm, handleIncomingDm } from "../app/lib/automation.server";
import { AUTOMATED_DISCLOSURE } from "../app/lib/reply-rules";
import { sendInstagramDm } from "../app/lib/meta.server";
import {
  getProductMappings,
  isHumanTakeoverActive,
  claimMessageReply,
  getSettings,
  getShopPlanAndUsage,
  getBrandVoice,
  alreadyRepliedToMessage,
  logLinkSent,
  incrementUsage,
  getRecentConversationContext,
  getStoredStoreContext,
} from "../app/lib/db.server";
import { getShopifyProductInfo } from "../app/lib/shopify-data.server";
import { canSendForShop, sendDmNow } from "../app/lib/queue.server";
import { getPlanConfig } from "../app/lib/plans";

const shop = { id: "00000000-0000-0000-0000-000000000001", shopify_domain: "test-store.myshopify.com" };
const growthPlan = getPlanConfig("GROWTH");
const proPlan = getPlanConfig("PRO");
const freePlan = getPlanConfig("FREE");

const WITH_DEFAULT_PRODUCT = {
  dm_automation_enabled: true,
  featured_product_id: "gid://shopify/Product/999",
  featured_variant_id: "gid://shopify/ProductVariant/888",
};

const MAPPING = {
  ig_media_id: "shared-media-1",
  product_id: "gid://shopify/Product/123",
  variant_id: "gid://shopify/ProductVariant/456",
  product_handle: "test-product",
  product_options: null,
};

let seq = 0;
function nonTextDm(contentType, overrides = {}) {
  seq += 1;
  return {
    id: `msg-${seq}`,
    text: null,
    content_type: contentType,
    attachment_meta: null,
    created_at: new Date().toISOString(),
    external_id: `1790000000${seq}`,
    from_user_id: "customer-1",
    channel: "dm",
    ...overrides,
  };
}

function sentText() {
  expect(sendDmNow).toHaveBeenCalledTimes(1);
  // sendDmNow(shopId, igUserId, text)
  return sendDmNow.mock.calls[0][2];
}

beforeEach(() => {
  vi.resetAllMocks();
  getSettings.mockResolvedValue({ dm_automation_enabled: true });
  getShopPlanAndUsage.mockResolvedValue({ usage: 0 });
  isHumanTakeoverActive.mockResolvedValue(false);
  getBrandVoice.mockResolvedValue({ tone: "friendly" });
  claimMessageReply.mockResolvedValue(true);
  getProductMappings.mockResolvedValue([]);
  alreadyRepliedToMessage.mockResolvedValue(false);
  logLinkSent.mockResolvedValue({ id: "row-1" });
  getRecentConversationContext.mockResolvedValue({ messages: [], links: [] });
  getStoredStoreContext.mockResolvedValue(null);
  getShopifyProductInfo.mockResolvedValue({ productName: "Test Product", productPrice: "25 USD" });
  canSendForShop.mockResolvedValue(true);
  sendDmNow.mockResolvedValue({ sent: true });
  sendInstagramDm.mockResolvedValue({ message_id: "sent-2" });
});

describe("shared post DMs", () => {
  it("replies with a tracked link when the shared post is mapped", async () => {
    getProductMappings.mockResolvedValue([MAPPING]);

    const res = await handleNonTextDm(
      nonTextDm("share", { attachment_meta: { types: ["share"], shared_media_id: "shared-media-1" } }),
      shop,
      growthPlan
    );

    expect(res.sent).toBe(true);
    expect(sentText()).toContain("https://short.test/");
    expect(incrementUsage).toHaveBeenCalledWith(shop.id, 1);
  });

  it("falls back to the shop's default product when the post is unmapped", async () => {
    getSettings.mockResolvedValue(WITH_DEFAULT_PRODUCT);

    const res = await handleNonTextDm(
      nonTextDm("share", { attachment_meta: { types: ["share"], shared_media_id: "unmapped-media" } }),
      shop,
      proPlan
    );

    expect(res.sent).toBe(true);
    expect(sentText()).toContain("https://short.test/");
  });

  // The default product is what Pro charges for. A Growth shop with one set
  // (from a lapsed trial, say) must not keep getting it.
  it("ignores the default product on a plan without it", async () => {
    getSettings.mockResolvedValue(WITH_DEFAULT_PRODUCT);

    const res = await handleNonTextDm(
      nonTextDm("share", { attachment_meta: { types: ["share"], shared_media_id: "unmapped-media" } }),
      shop,
      growthPlan
    );

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });

  // Guessing is how the wrong-product replies happened. Silence is the correct
  // failure mode: the merchant would rather answer it themselves than have a
  // customer sent to something they did not ask about.
  it("stays silent rather than guessing when no product resolves", async () => {
    const res = await handleNonTextDm(
      nonTextDm("share", { attachment_meta: { types: ["share"], shared_media_id: "unmapped-media" } }),
      shop,
      growthPlan
    );

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it("stays silent when Instagram gave no shared media id and there is no featured product", async () => {
    const res = await handleNonTextDm(
      nonTextDm("share", { attachment_meta: { types: ["share"], shared_media_id: null } }),
      shop,
      growthPlan
    );

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });
});

/**
 * Stories are why the default product exists. A story is not in
 * post_product_map and can't be (it expires in a day), and a text-less story
 * event carries nothing to search a catalog with, so the default product is
 * the only thing that can answer one.
 *
 * These arrive with content_type "story_reply"/"story_mention" rather than
 * "heart" or "share", because parseMessageEvent lets story context outrank the
 * payload kind. That is exactly why they were being dropped.
 */
describe("story DMs", () => {
  it.each(["story_reply", "story_mention"])(
    "answers a text-less %s with the default product",
    async (kind) => {
      getSettings.mockResolvedValue(WITH_DEFAULT_PRODUCT);

      const res = await handleNonTextDm(nonTextDm(kind), shop, proPlan);

      expect(res.sent).toBe(true);
      expect(sentText()).toContain("https://short.test/");
      expect(incrementUsage).toHaveBeenCalledWith(shop.id, 1);
    }
  );

  // Story automation is the other half of what Pro charges for. The webhook
  // gates story events before this is reached, so this pins the second line of
  // defence rather than the primary one.
  it.each(["story_reply", "story_mention"])(
    "does not answer a %s on a plan without stories",
    async (kind) => {
      getSettings.mockResolvedValue(WITH_DEFAULT_PRODUCT);

      const res = await handleNonTextDm(nonTextDm(kind), shop, growthPlan);

      expect(res.sent).toBe(false);
      expect(sendDmNow).not.toHaveBeenCalled();
    }
  );

  // Silence beats a homepage link here: an info_ link carries no cart
  // attribute, so it can never be attributed however well it converts.
  it("stays silent on a story when no default product is set", async () => {
    const res = await handleNonTextDm(nonTextDm("story_mention"), shop, proPlan);

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
    expect(incrementUsage).not.toHaveBeenCalled();
  });
});

describe("heart DMs", () => {
  it("sends a short warm reply", async () => {
    const res = await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(sentText().length).toBeGreaterThan(0);
    expect(incrementUsage).toHaveBeenCalledWith(shop.id, 1);
  });

  // A heart is a wordless compliment. Answering it with a sales link is the
  // behaviour that gets an automation identified as a bot.
  it("never includes a link", async () => {
    await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);

    const text = sentText();
    expect(text).not.toContain("http");
    expect(text).not.toContain("short.test");
  });

  it("uses the brand tone when one is set", async () => {
    getBrandVoice.mockResolvedValue({ tone: "professional" });
    await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);
    expect(sentText()).toMatch(/appreciate/i);
  });

  // Brand voice is a paid capability, but for a long time only the UI enforced
  // that. A shop that customised its voice on Growth and then dropped to Free
  // kept the paid behaviour, because every reply path fetched the row without
  // consulting the plan.
  it("ignores a stored brand voice on a plan without brandVoice", async () => {
    getBrandVoice.mockResolvedValue({ tone: "professional" });

    await handleNonTextDm(nonTextDm("heart"), shop, freePlan);

    expect(getBrandVoice).not.toHaveBeenCalled();
    expect(sentText()).not.toMatch(/appreciate/i);
  });

  it("falls back to a friendly reply for an unrecognised tone", async () => {
    getBrandVoice.mockResolvedValue({ tone: "not-a-real-tone" });
    const res = await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);
    expect(res.sent).toBe(true);
    expect(sentText().length).toBeGreaterThan(0);
  });
});

describe("payloads that must never be answered", () => {
  // We cannot see what is in a photo or video. A confident reply to a
  // customer's picture is worse for the merchant than no reply at all.
  it.each(["image", "video", "audio", "file", "unsupported", "reaction"])(
    "records but does not answer a %s payload",
    async (kind) => {
      const res = await handleNonTextDm(nonTextDm(kind), shop, growthPlan);

      expect(res.sent).toBe(false);
      expect(sendDmNow).not.toHaveBeenCalled();
      expect(incrementUsage).not.toHaveBeenCalled();
    }
  );

  it("does not answer a plain text content type", async () => {
    // Text DMs belong to handleIncomingDm; double-handling would double-reply.
    const res = await handleNonTextDm(nonTextDm(null), shop, growthPlan);
    expect(res.sent).toBe(false);
  });
});

/**
 * "Are you a bot?" must be answered honestly, from a fixed string.
 *
 * A customer asked Mark Watts Studios "are you bot or real?" on 3 Sep 2026 and
 * was told "I'm a real person here to help you shop", then replied "wait im
 * talking to THE Matt Watts???". Whether the reply is honest cannot depend on
 * a prompt being followed, so this path never reaches the model.
 */
describe("being asked whether we're a bot", () => {
  const textDm = (text) => ({
    id: "msg-bot-1",
    external_id: "ext-bot-1",
    channel: "dm",
    text,
    from_user_id: "customer-1",
    ai_intent: "store_question",
    ai_confidence: 0.9,
    created_at: new Date().toISOString(),
  });

  beforeEach(() => {
    getShopPlanAndUsage.mockResolvedValue({ usage: 0 });
    getSettings.mockResolvedValue({ dm_automation_enabled: true });
  });

  it("answers with the disclosure instead of asking the model", async () => {
    const res = await handleIncomingDm(textDm("are you bot or real?"), shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(sendDmNow).toHaveBeenCalled();
    expect(sendDmNow.mock.calls[0][2]).toBe(AUTOMATED_DISCLOSURE);
  });

  it("answers on the free plan too, since honesty isn't a paid feature", async () => {
    const res = await handleIncomingDm(textDm("are you a bot?"), shop, freePlan);

    expect(res.sent).toBe(true);
    expect(sendDmNow.mock.calls[0][2]).toBe(AUTOMATED_DISCLOSURE);
  });

  it("never claims to be a person", async () => {
    await handleIncomingDm(textDm("am i talking to a real person"), shop, growthPlan);

    const sent = sendDmNow.mock.calls[0][2];
    expect(sent).toMatch(/automated assistant/i);
    expect(sent).not.toMatch(/real person|i'm human|not a bot/i);
  });

  it("stays out of it while the owner is handling the conversation", async () => {
    isHumanTakeoverActive.mockResolvedValue(true);

    const res = await handleIncomingDm(textDm("are you a bot?"), shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });

  it("leaves an ordinary product question alone", async () => {
    // The canned answer must not hijack a real question that happens to
    // contain one of these words.
    const res = await handleIncomingDm(textDm("is this real leather?"), shop, growthPlan);

    const sent = sendDmNow.mock.calls[0]?.[2];
    if (res.sent) expect(sent).not.toBe(AUTOMATED_DISCLOSURE);
  });
});

describe("guards shared with the text pipeline", () => {
  it("stays out of a conversation the owner is handling", async () => {
    isHumanTakeoverActive.mockResolvedValue(true);
    getProductMappings.mockResolvedValue([MAPPING]);

    const res = await handleNonTextDm(
      nonTextDm("share", { attachment_meta: { types: ["share"], shared_media_id: "shared-media-1" } }),
      shop,
      growthPlan
    );

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });

  it("respects the monthly cap", async () => {
    getShopPlanAndUsage.mockResolvedValue({ usage: growthPlan.cap });

    const res = await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(res.reason).toMatch(/cap/i);
    expect(sendDmNow).not.toHaveBeenCalled();
  });

  it("respects the merchant's DM automation toggle", async () => {
    getSettings.mockResolvedValue({ dm_automation_enabled: false });

    const res = await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });

  it("does not reply twice to the same message", async () => {
    claimMessageReply.mockResolvedValue(false);

    const res = await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });

  it("skips a message that was already answered", async () => {
    alreadyRepliedToMessage.mockResolvedValue(true);

    const res = await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });

  // sendDmNow signals failure by throwing, and sendDmReply only gives up
  // (rather than queueing for retry) when the error is permanent.
  it("does not count usage when the send fails permanently", async () => {
    sendDmNow.mockRejectedValue(new Error("Instagram user cannot be found"));

    const res = await handleNonTextDm(nonTextDm("heart"), shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it("returns a reason instead of throwing when a sender id is missing", async () => {
    const res = await handleNonTextDm(nonTextDm("heart", { from_user_id: null }), shop, growthPlan);
    expect(res.sent).toBe(false);
    expect(sendDmNow).not.toHaveBeenCalled();
  });
});
