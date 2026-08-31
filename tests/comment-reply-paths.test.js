/**
 * Reply-path tests for comment automation (handleIncomingComment).
 *
 * These exist because two crashes shipped to production in Aug 2026 and
 * silenced seven purchase-intent comments on a viral post:
 *   1. The MCP catalog-search fallback stripped product gids to bare numbers,
 *      which buildCheckoutLink rejects ("Invalid product ID format").
 *   2. The homepage-fallback path reassigned a const (TypeError at runtime).
 * Neither could be caught by lint or the production smoke tests. Each test
 * here drives the REAL pipeline (automation.server + links.server) with fake
 * customers; only the external services (OpenAI, Supabase, Meta, Shopify
 * Admin) are mocked. A crash or missing send on any path fails CI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── External-service mocks ──────────────────────────────────────────────────

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async () => ({
            // Deliberately link-free: the pipeline's link guarantee must
            // append the real tracked URL itself, and these tests assert it.
            choices: [{ message: { content: "Love this! You can grab it here:" } }],
          }),
        },
      };
    }
  },
}));

vi.mock("../app/lib/supabase.server", () => {
  // Chainable, thenable query-builder fake: every chain resolves to an empty
  // successful result. Enough for hasCommentBeenReplied + shortenUrlsInReply.
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
  alreadyRepliedToMessage: vi.fn(async () => false),
  alreadyRepliedToExternalMessage: vi.fn(async () => false),
  claimMessageReply: vi.fn(async () => true),
  claimCommentReply: vi.fn(async () => true),
  isHumanTakeoverActive: vi.fn(async () => false),
  getProductMappings: vi.fn(async () => []),
  getSettings: vi.fn(async () => ({ comment_automation_enabled: true })),
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
  getShopifyProductContextForReply: vi.fn(async () => ({
    title: "Test Product",
    handle: "test-product",
    options: [],
    variants: { nodes: [] },
  })),
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

// ── System under test (real code) ───────────────────────────────────────────

import { handleIncomingComment } from "../app/lib/automation.server";
import { sendInstagramPrivateReply, sendInstagramDm } from "../app/lib/meta.server";
import {
  getProductMappings,
  isHumanTakeoverActive,
  claimCommentReply,
  claimMessageReply,
  getSettings,
  getShopPlanAndUsage,
  getBrandVoice,
  alreadyRepliedToMessage,
  alreadyRepliedToExternalMessage,
  logLinkSent,
  getRecentConversationContext,
  getStoredStoreContext,
} from "../app/lib/db.server";
import { searchCatalogNormalized, resolveVariantViaMcp } from "../app/lib/storefront-mcp.server";
import {
  getShopifyProductInfo,
  getShopifyProductContextForReply,
  buildProductContextForAI,
  detectSizeOption,
  resolveVariantBySize,
  getShopPrimaryDomainHost,
  searchProductsByDomain,
} from "../app/lib/shopify-data.server";
import { canSendForShop, sendDmNow } from "../app/lib/queue.server";
import { getPlanConfig } from "../app/lib/plans";
import { effectivePlan } from "../app/lib/entitlements";

const shop = { id: "00000000-0000-0000-0000-000000000001", shopify_domain: "test-store.myshopify.com" };

// Real plan configs, not hand-rolled fixtures. A literal like
// `{ name: "GROWTH", cap: 500 }` silently drifts from production the moment a
// capability flag is added, and then passes while the real gate rejects.
const growthPlan = getPlanConfig("GROWTH");
const freePlan = getPlanConfig("FREE");

let commentSeq = 0;
function comment(text, overrides = {}) {
  commentSeq += 1;
  return {
    id: `msg-${commentSeq}`,
    text,
    ai_intent: "purchase",
    ai_confidence: 0.9,
    created_at: new Date().toISOString(),
    external_id: `1780000000${commentSeq}`,
    from_user_id: "customer-1",
    channel: "comment",
    ...overrides,
  };
}

function sentReplyText() {
  expect(sendInstagramPrivateReply).toHaveBeenCalledTimes(1);
  return sendInstagramPrivateReply.mock.calls[0][2];
}

beforeEach(() => {
  // Full reset then re-establish defaults, so per-test overrides
  // (e.g. isHumanTakeoverActive → true) can never leak into the next test.
  vi.resetAllMocks();
  getSettings.mockResolvedValue({ comment_automation_enabled: true });
  getShopPlanAndUsage.mockResolvedValue({ usage: 0 });
  isHumanTakeoverActive.mockResolvedValue(false);
  getBrandVoice.mockResolvedValue({ tone: "friendly" });
  claimCommentReply.mockResolvedValue(true);
  claimMessageReply.mockResolvedValue(true);
  getProductMappings.mockResolvedValue([]);
  alreadyRepliedToMessage.mockResolvedValue(false);
  alreadyRepliedToExternalMessage.mockResolvedValue(false);
  logLinkSent.mockResolvedValue({ id: "row-1" });
  getRecentConversationContext.mockResolvedValue({ messages: [], links: [] });
  getStoredStoreContext.mockResolvedValue(null);
  searchCatalogNormalized.mockResolvedValue([]);
  resolveVariantViaMcp.mockResolvedValue(null);
  getShopifyProductInfo.mockResolvedValue({ productName: "Test Product", productPrice: "25 USD" });
  getShopifyProductContextForReply.mockResolvedValue({
    title: "Test Product",
    handle: "test-product",
    options: [],
    variants: { nodes: [] },
  });
  buildProductContextForAI.mockReturnValue({ text: "" });
  detectSizeOption.mockReturnValue(null);
  resolveVariantBySize.mockReturnValue(null);
  getShopPrimaryDomainHost.mockResolvedValue(null);
  searchProductsByDomain.mockResolvedValue([]);
  canSendForShop.mockResolvedValue(true);
  sendDmNow.mockResolvedValue({ sent: true });
  sendInstagramPrivateReply.mockResolvedValue({ message_id: "sent-1" });
  sendInstagramDm.mockResolvedValue({ message_id: "sent-2" });
});

describe("comment reply paths", () => {
  it("mapped post: replies with a tracked link", async () => {
    getProductMappings.mockResolvedValue([
      {
        ig_media_id: "media-1",
        product_id: "gid://shopify/Product/123",
        variant_id: "gid://shopify/ProductVariant/456",
        product_handle: "test-product",
        product_options: null,
      },
    ]);

    const res = await handleIncomingComment(comment("how much is this?"), "media-1", shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(sentReplyText()).toMatch(/https?:\/\//);
  });

  it("unmapped post with catalog match: replies with a tracked link (regression: numeric product ID crash)", async () => {
    getProductMappings.mockResolvedValue([]);
    searchCatalogNormalized.mockResolvedValue([
      {
        id: "gid://shopify/Product/123",
        title: "Manifestation Magic Nail Polish",
        handle: "manifestation-magic",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/456" }] },
      },
    ]);

    const res = await handleIncomingComment(comment("Mani 💅"), "media-unmapped", shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(sentReplyText()).toMatch(/https?:\/\//);
  });

  it("unmapped post, no catalog match: homepage-fallback reply sends (regression: const reassignment crash)", async () => {
    getProductMappings.mockResolvedValue([]);
    searchCatalogNormalized.mockResolvedValue([]);

    const res = await handleIncomingComment(comment("this is gorgeous 😍"), "media-unmapped", shop, growthPlan);

    expect(res.sent).toBe(true);
    // Homepage link must be converted to a tracked short link, never the raw domain.
    expect(sentReplyText()).toContain("https://short.test/");
  });

  it("FREE plan outside the comment window: does not reply", async () => {
    const res = await handleIncomingComment(comment("how much?"), "media-1", shop, freePlan);

    expect(res.sent).toBe(false);
    expect(sendInstagramPrivateReply).not.toHaveBeenCalled();
    expect(sendInstagramDm).not.toHaveBeenCalled();
  });

  // The whole point of the window: a Free merchant must see comment-to-DM work
  // on a real customer, or they have no reason to believe it does.
  it("FREE plan inside the comment window: replies", async () => {
    const inWindow = effectivePlan(freePlan, {
      comment_trial_started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(inWindow.comments).toBe(true);

    const res = await handleIncomingComment(comment("how much?"), "media-1", shop, inWindow);

    expect(res.sent).toBe(true);
    expect(sendInstagramPrivateReply).toHaveBeenCalled();
  });

  it("FREE plan with an expired comment window: does not reply", async () => {
    const expired = effectivePlan(freePlan, {
      comment_trial_started_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(expired.comments).toBe(false);
    expect(expired.commentTrial.expired).toBe(true);

    const res = await handleIncomingComment(comment("how much?"), "media-1", shop, expired);

    expect(res.sent).toBe(false);
  });

  it("human takeover active: stays out of the conversation", async () => {
    isHumanTakeoverActive.mockResolvedValue(true);

    const res = await handleIncomingComment(comment("how much?"), "media-1", shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(sendInstagramPrivateReply).not.toHaveBeenCalled();
  });

  it("not_relevant intent: no reply", async () => {
    const res = await handleIncomingComment(
      comment("love your feed!", { ai_intent: "not_relevant" }),
      "media-1",
      shop,
      growthPlan
    );

    expect(res.sent).toBe(false);
    expect(sendInstagramPrivateReply).not.toHaveBeenCalled();
  });

  it("already claimed (duplicate webhook): does not double-send", async () => {
    getProductMappings.mockResolvedValue([]);
    searchCatalogNormalized.mockResolvedValue([]);
    claimCommentReply.mockResolvedValue(false);

    const res = await handleIncomingComment(comment("gorgeous!"), "media-unmapped", shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(sendInstagramPrivateReply).not.toHaveBeenCalled();
  });
});
