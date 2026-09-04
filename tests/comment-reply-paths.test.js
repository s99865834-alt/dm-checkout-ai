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
  markReplyUndelivered: vi.fn(),
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
  getInstagramMediaByIds: vi.fn(async () => []),
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

import { handleIncomingComment, captionToSearchTerm } from "../app/lib/automation.server";
import { sendInstagramPrivateReply, sendInstagramDm, getInstagramMediaByIds } from "../app/lib/meta.server";
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
  deleteLinkSent,
  markReplyUndelivered,
  getRecentConversationContext,
  getStoredStoreContext,
  incrementUsage,
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
  getInstagramMediaByIds.mockResolvedValue([]);
});

/**
 * A reply that Instagram refuses.
 *
 * Instagram allows exactly one private reply per comment, ever. When another
 * automation tool on the same account gets there first it fails with subcode
 * 2534023. This happened three times across Love By Luna and Mark Watts on
 * 1-2 Sep 2026, and because the claim row is written before the send and kept
 * afterwards, each one still counted as a reply on /admin and in the
 * merchant's response rate.
 */
function replyAlreadyExists() {
  const err = new Error("There has been reply to this comment before");
  err.meta = { error_subcode: 2534023, code: 100 };
  return err;
}

/**
 * A comment that vanished before we could answer it.
 *
 * Love By Luna, 4 Sep 2026: a self-promotional comment arrived at 11:30:34,
 * we attempted the private reply at 11:30:43, and Meta refused with subcode
 * 2534066. Fetching the comment id afterwards returned "does not exist", so
 * it had been deleted (Instagram's spam filter, most likely) inside those
 * nine seconds. Meta words this one as a permissions problem, which it wasn't:
 * the same token had been sending comment replies all week.
 */
function commentGoneOrNoScope() {
  const err = new Error(
    "Instagram API error: Please check if access token has enough IG permissions granular scopes for IG private reply. Or verify if the comment id is valid (Code: 200)"
  );
  err.meta = {
    message:
      "Please check if access token has enough IG permissions granular scopes for IG private reply. Or verify if the comment id is valid",
    type: "IGApiException",
    code: 200,
    error_subcode: 2534066,
  };
  return err;
}

describe("a reply Instagram refuses", () => {
  const mappedPost = () =>
    getProductMappings.mockResolvedValue([
      {
        ig_media_id: "media-1",
        product_id: "gid://shopify/Product/123",
        variant_id: "gid://shopify/ProductVariant/456",
        product_handle: "test-product",
        product_options: null,
      },
    ]);

  it("marks the claim so it stops counting as a delivered reply", async () => {
    mappedPost();
    sendInstagramPrivateReply.mockRejectedValue(replyAlreadyExists());

    const msg = comment("how much is this?");
    const res = await handleIncomingComment(msg, "media-1", shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(markReplyUndelivered).toHaveBeenCalledWith(
      shop.id,
      `dm_reply_comment_${msg.external_id}`,
      "instagram_reply_already_exists"
    );
  });

  it("does not charge the merchant for a message nobody received", async () => {
    mappedPost();
    sendInstagramPrivateReply.mockRejectedValue(replyAlreadyExists());

    await handleIncomingComment(comment("how much is this?"), "media-1", shop, growthPlan);

    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it("removes the link rows so nobody holds a link that resolves", async () => {
    mappedPost();
    sendInstagramPrivateReply.mockRejectedValue(replyAlreadyExists());

    await handleIncomingComment(comment("how much is this?"), "media-1", shop, growthPlan);

    expect(deleteLinkSent).toHaveBeenCalled();
  });

  it("records the reason for a failure that isn't the one-reply limit", async () => {
    mappedPost();
    sendInstagramPrivateReply.mockRejectedValue(new Error("network unreachable"));

    const msg = comment("how much is this?");
    await handleIncomingComment(msg, "media-1", shop, growthPlan);

    expect(markReplyUndelivered).toHaveBeenCalledWith(
      shop.id,
      `dm_reply_comment_${msg.external_id}`,
      "network unreachable"
    );
  });

  it("leaves the claim alone when the send succeeds", async () => {
    mappedPost();

    const res = await handleIncomingComment(comment("how much is this?"), "media-1", shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(markReplyUndelivered).not.toHaveBeenCalled();
  });

  it("records a vanished comment under its own reason, not as an app error", async () => {
    mappedPost();
    sendInstagramPrivateReply.mockRejectedValue(commentGoneOrNoScope());

    const msg = comment("how much is this?");
    const res = await handleIncomingComment(msg, "media-1", shop, growthPlan);

    expect(res.sent).toBe(false);
    expect(markReplyUndelivered).toHaveBeenCalledWith(
      shop.id,
      `dm_reply_comment_${msg.external_id}`,
      "instagram_private_reply_rejected"
    );
  });

  it("keeps a vanished comment out of the competing-tool count", async () => {
    // The contested-inbox banner counts reasons starting with
    // "instagram_reply_already_exists". A deleted comment is not a rival tool
    // and must not read as one.
    mappedPost();
    sendInstagramPrivateReply.mockRejectedValue(commentGoneOrNoScope());

    await handleIncomingComment(comment("how much is this?"), "media-1", shop, growthPlan);

    const reason = markReplyUndelivered.mock.calls[0][2];
    expect(reason.startsWith("instagram_reply_already_exists")).toBe(false);
  });

  it("still treats an unrecognised failure as a real error", async () => {
    // Quieting Instagram's documented refusals must not quieten everything.
    mappedPost();
    sendInstagramPrivateReply.mockRejectedValue(new Error("socket hang up"));

    const msg = comment("how much is this?");
    await handleIncomingComment(msg, "media-1", shop, growthPlan);

    expect(markReplyUndelivered).toHaveBeenCalledWith(
      shop.id,
      `dm_reply_comment_${msg.external_id}`,
      "socket hang up"
    );
  });
});

/**
 * Which link a product question earns.
 *
 * Product-page links are the best-clicking link we send and have never
 * attributed a single order, because they carry only `ref` (same-session)
 * while checkout links also carry `attributes[ref]`. So a product question is
 * answered in the reply and offered a checkout link, and the page link is kept
 * for customers who actually asked for the page.
 */
describe("links on a product question", () => {
  const mappedPost = () =>
    getProductMappings.mockResolvedValue([
      {
        ig_media_id: "media-1",
        product_id: "gid://shopify/Product/123",
        variant_id: "gid://shopify/ProductVariant/456",
        product_handle: "test-product",
        product_options: null,
      },
    ]);

  it("sends a checkout link, not a product page link", async () => {
    mappedPost();

    const res = await handleIncomingComment(
      comment("is this jacket waterproof?", { ai_intent: "product_question" }),
      "media-1",
      shop,
      growthPlan
    );

    expect(res.sent).toBe(true);
    // URLs are shortened, so the link type shows in the id: a bare 8-character
    // id is a checkout link, a "pdp_" prefix is a product page.
    const text = sentReplyText();
    expect(text).not.toContain("pdp_");
    expect(text).toMatch(/https:\/\/short\.test\/[A-Za-z0-9]{8}\b/);
  });

  it("sends a product page link when they asked for the page", async () => {
    mappedPost();

    const res = await handleIncomingComment(
      comment("can you send me the product page?", { ai_intent: "product_question" }),
      "media-1",
      shop,
      growthPlan
    );

    expect(res.sent).toBe(true);
    expect(sentReplyText()).toContain("short.test/pdp_");
  });

  it("does not log a product page link it never sent", async () => {
    // The old path built both links and logged both while sending one, which
    // overstated "links sent" in the merchant's analytics.
    mappedPost();

    await handleIncomingComment(
      comment("does it come in black?", { ai_intent: "variant_inquiry" }),
      "media-1",
      shop,
      growthPlan
    );

    const loggedLinkIds = logLinkSent.mock.calls.map((c) => c[0].linkId);
    expect(loggedLinkIds.some((id) => String(id).startsWith("pdp_"))).toBe(false);
  });
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

  // Most real comments are pure reaction and name no product, so the comment
  // search finds nothing and the post used to answer with an info_ homepage
  // link. Those carry no cart attribute and aren't click-tracked, so the order
  // can never be attributed however well the reply converts.
  it("unmapped post, reaction-only comment: resolves the product from the caption", async () => {
    getProductMappings.mockResolvedValue([]);
    getInstagramMediaByIds.mockResolvedValue([
      { id: "media-caption-1", caption: "Fresh batch of Sea Moss Gel 🌊 available now #seamoss @shanescares" },
    ]);
    searchCatalogNormalized
      .mockResolvedValueOnce([]) // the comment "🔥🔥🔥" matches nothing
      .mockResolvedValueOnce([
        {
          id: "gid://shopify/Product/789",
          title: "Sea Moss Gel",
          handle: "sea-moss-gel",
          variants: { nodes: [{ id: "gid://shopify/ProductVariant/987" }] },
        },
      ]);

    const res = await handleIncomingComment(comment("🔥🔥🔥"), "media-caption-1", shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(sentReplyText()).toMatch(/https?:\/\//);
    // Second search is the caption, stripped of emoji, hashtags and mentions.
    expect(searchCatalogNormalized).toHaveBeenCalledTimes(2);
    expect(searchCatalogNormalized.mock.calls[1][1]).toBe("Fresh batch of Sea Moss Gel available now");
  });

  it("caption lookup fails: still replies, falling back to the homepage link", async () => {
    getProductMappings.mockResolvedValue([]);
    searchCatalogNormalized.mockResolvedValue([]);
    getInstagramMediaByIds.mockRejectedValue(new Error("Graph API down"));

    const res = await handleIncomingComment(comment("😍😍"), "media-caption-2", shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(sentReplyText()).toContain("https://short.test/");
  });

  it("caption with nothing searchable in it: no wasted second search", async () => {
    getProductMappings.mockResolvedValue([]);
    searchCatalogNormalized.mockResolvedValue([]);
    getInstagramMediaByIds.mockResolvedValue([{ id: "media-caption-3", caption: "🔥🔥🔥 #art #vibes" }]);

    const res = await handleIncomingComment(comment("👏"), "media-caption-3", shop, growthPlan);

    expect(res.sent).toBe(true);
    expect(searchCatalogNormalized).toHaveBeenCalledTimes(1);
  });
});

describe("captionToSearchTerm", () => {
  it("keeps the words that describe the product", () => {
    expect(captionToSearchTerm("New drop! The Rizzbot is here 🤖 #art #sculpture @friend")).toBe(
      "New drop! The Rizzbot is here"
    );
  });

  it("strips URLs", () => {
    expect(captionToSearchTerm("Shop the Aurora Ring at https://example.com/x today")).toBe(
      "Shop the Aurora Ring at today"
    );
  });

  it("truncates a rambling caption, which dilutes the search rather than sharpening it", () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    expect(captionToSearchTerm(long).split(" ")).toHaveLength(12);
  });

  const nothingSearchable = ["🔥🔥🔥", "#sale #shop #love", "@someone", "", "  ", null, undefined];
  for (const caption of nothingSearchable) {
    it(`returns null for ${JSON.stringify(caption)}`, () => {
      expect(captionToSearchTerm(caption)).toBeNull();
    });
  }
});
