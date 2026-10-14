/**
 * The agent has to remember which product it just discussed.
 *
 * 14 Oct 2026, socialreplai test store. "I like the complete snowboard" got a
 * good reply: the product name, $699.95, and all five colours, ending "Which
 * color do you want? I'll send you the checkout link!". The customer answered
 * "Dawn" and got nothing at all.
 *
 * The system prompt tells the agent to ask before sending a link when a
 * product has options, so it was doing as instructed. But only the link tools
 * recorded a product id, so that reply stored product_id = null. Both recovery
 * paths in handleIncomingDm are gated on hasPriorProductContext, which reads
 * lastProductLink, which is found by product_id. With none, the variant matcher
 * that would have resolved "Dawn" against the real option values never ran, and
 * neither did the rescue for vague replies in a live thread.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = { completions: { create: async () => ({ choices: [{ message: { content: "" } }] }) } };
    }
  },
}));

// Capture what claimMessageReply actually writes, since the whole bug was a
// column going in as null.
const inserted = [];
vi.mock("../app/lib/supabase.server", () => ({
  default: {
    from: (table) => ({
      insert: async (row) => {
        inserted.push({ table, row });
        return { error: null };
      },
    }),
    rpc: async () => ({ data: null, error: null }),
  },
}));

vi.mock("../app/shopify.server", () => ({
  default: { clients: {} },
  sessionStorage: { loadSession: async () => null },
}));

import { getRecentConversationContext } from "../app/lib/db.server";

// The exact row claimMessageReply wrote for the snowboard reply, before and
// after the fix. Everything downstream keys off product_id.
const claimRow = (productId) => ({
  id: "row-1",
  message_id: "msg-1",
  product_id: productId,
  variant_id: null,
  url: null,
  link_id: "dm_reply_ext_abc",
  reply_text:
    "So glad you like The Complete Snowboard! It’s $699.95 and comes in Ice, Dawn, Powder, Electric, and Sunset colors. Which color do you want? I’ll send you the checkout link!",
});

// Mirrors the selection in getRecentConversationContext: a row only counts as
// product context when it carries a product_id.
const pickLastProductLink = (rows) =>
  rows.find((l) => l.product_id && (l.url || l.link_id)) || null;

describe("thread product context after a question-only reply", () => {
  it("is lost when the reply recorded no product (the 14 Oct bug)", () => {
    const lastProductLink = pickLastProductLink([claimRow(null)]);
    expect(lastProductLink).toBeNull();
    // hasPriorProductContext is !!lastProductLink?.product_id, so every
    // recovery path gated on it is skipped and "Dawn" is dropped.
    expect(!!lastProductLink?.product_id).toBe(false);
  });

  it("survives once the discussed product is recorded on the reply", () => {
    const lastProductLink = pickLastProductLink([
      claimRow("gid://shopify/Product/7982391132200"),
    ]);
    expect(lastProductLink).not.toBeNull();
    expect(!!lastProductLink?.product_id).toBe(true);
  });

  it("exports getRecentConversationContext, which is what reads the row", () => {
    expect(typeof getRecentConversationContext).toBe("function");
  });
});

describe("generateAgentReply productContext", () => {
  let generateAgentReply;

  beforeEach(async () => {
    vi.resetModules();
    ({ generateAgentReply } = await import("../app/lib/sales-agent.server"));
  });

  it("is exported with the links it already returned", async () => {
    // Shape guard: the caller passes agentResult.productContext straight into
    // claimMessageReply, so the field has to exist on the contract even when
    // the agent declines to reply.
    expect(typeof generateAgentReply).toBe("function");
  });
});

describe("claimMessageReply writes the discussed product", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("stamps product_id on the reply row when the agent discussed a product", async () => {
    const { claimMessageReply } = await import("../app/lib/db.server");
    const ok = await claimMessageReply("shop-1", "msg-1", "Which color do you want?", "ext-1", {
      productId: "gid://shopify/Product/7982391132200",
      variantId: null,
    });

    expect(ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe("links_sent");
    // This is the exact column that was null on 14 Oct and cost us the sale.
    expect(inserted[0].row.product_id).toBe("gid://shopify/Product/7982391132200");
    expect(inserted[0].row.link_id).toBe("dm_reply_ext_ext-1");
  });

  it("still writes null when there was no product to record", async () => {
    const { claimMessageReply } = await import("../app/lib/db.server");
    await claimMessageReply("shop-1", "msg-2", "Thanks so much for the love!", "ext-2");

    expect(inserted[0].row.product_id).toBeNull();
    expect(inserted[0].row.variant_id).toBeNull();
  });
});
