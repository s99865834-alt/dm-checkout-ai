/**
 * AI sales associate for Instagram DMs.
 *
 * Replaces the "classify intent → pre-fetch context → one-shot prompt"
 * pipeline with a tool-calling loop: the model decides what it needs to look
 * up (catalog search, product details, store policies) and mints tracked
 * checkout / product-page links itself, then writes the reply. This fixes the
 * failure class where the pre-fetched context didn't contain the answer and
 * the AI could only say "I don't have that information", and it handles
 * mixed-intent questions ("is it vegan and how long is shipping?") that a
 * hard intent router can't.
 *
 * Safety properties:
 * - Links: the model never writes URLs itself. Checkout / PDP links come from
 *   tools (already tracked short links); any URL in the final text that did
 *   not come from a tool result is stripped. Store-page/policy URLs surfaced
 *   by get_store_info are shortened into tracked info_ links afterwards.
 * - Attribution: every checkout/PDP link is created via links.server.js and
 *   returned to the caller so it can write links_sent rows after the DM is
 *   actually sent — same lifecycle as the legacy pipeline.
 * - Compliance gates (one reply per message, opt-out, 24h window, usage caps,
 *   plan checks) all stay in automation.server.js; this module only generates
 *   text + links.
 *
 * Kill switch: set SALES_AGENT_DISABLED=1 to fall back to the legacy
 * per-intent pipeline. Model: SALES_AGENT_MODEL (default gpt-4.1).
 */

import OpenAI from "openai";
import logger from "./logger.server";
import { getStoredStoreContext } from "./db.server";
import {
  getShopifyStoreInfo,
  getShopifyProductContextForReply,
  buildStoreContextForAI,
  searchProductsByDomain,
} from "./shopify-data.server";
import { searchCatalogNormalized } from "./storefront-mcp.server";
import {
  buildCheckoutLink,
  buildProductPageLink,
  getClickTrackingUrlForMessage,
  shortenUrlsInReply,
} from "./links.server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/**
 * Customer-facing reply model. Classification stays on gpt-4o-mini
 * (ai.server.js) — it's a constrained labelling task — but the reply is the
 * product, so it gets a stronger model. Exported so the legacy reply
 * generators in automation.server.js use the same model.
 */
export const REPLY_MODEL = process.env.SALES_AGENT_MODEL || "gpt-4.1";

const MAX_TOOL_ROUNDS = 4;

export function isSalesAgentEnabled() {
  return !!openai && process.env.SALES_AGENT_DISABLED !== "1";
}

/**
 * Build chat-completions params that work across model families: gpt-5/o*
 * reasoning models reject `temperature` and want `max_completion_tokens`.
 * Exported so the legacy reply generators can share the same REPLY_MODEL.
 */
export function completionParamsForModel(model, base) {
  const isReasoningModel = /^(gpt-5|o\d)/.test(model);
  if (isReasoningModel) {
    const { temperature: _temperature, max_tokens, ...rest } = base;
    return { ...rest, max_completion_tokens: max_tokens };
  }
  return base;
}

function toProductGid(id) {
  const s = String(id || "").trim();
  if (!s) return null;
  return s.startsWith("gid://") ? s : `gid://shopify/Product/${s}`;
}

function toVariantGid(id) {
  const s = String(id || "").trim();
  if (!s) return null;
  return s.startsWith("gid://") ? s : `gid://shopify/ProductVariant/${s}`;
}

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the store's live product catalog. Use when the customer mentions a product you don't already have in context, or to find alternatives when the exact thing they asked for isn't available.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Product search terms, e.g. 'black hoodie' or 'hair serum'",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description:
        "Get full details for one product: description, price, available options (sizes/colors), and every variant with its variant_id. Use before answering questions about a specific product or before creating a checkout link for a specific variant.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description: "The product_id from search_products or the conversation context",
          },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_info",
      description:
        "Get store-level information: shipping/return/privacy policies, store pages, contact email, total product count, and store description. Use for any question that isn't about one specific product.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_checkout_link",
      description:
        "Create a tracked checkout link for a product (optionally a specific variant). Returns the exact URL to paste into your reply. Use when the customer shows buying intent.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The product_id" },
          variant_id: {
            type: "string",
            description:
              "Optional variant_id from get_product_details when the customer chose a specific size/color",
          },
          quantity: { type: "integer", description: "Quantity, default 1" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_page_link",
      description:
        "Create a tracked link to a product's page on the store, where the customer can read details and see all variants. Use when they want to learn more but aren't ready to buy.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The product_id" },
          variant_id: { type: "string", description: "Optional variant_id to preselect" },
        },
        required: ["product_id"],
      },
    },
  },
];

/**
 * Compact catalog search result for the model: enough to pick a product and
 * talk about price, small enough to keep the context lean.
 */
function formatSearchResults(products) {
  return (products || []).slice(0, 5).map((p) => ({
    product_id: p.id,
    title: p.title,
    handle: p.handle || undefined,
    price: p.variants?.nodes?.[0]?.price ?? undefined,
  }));
}

function formatProductDetails(raw) {
  if (!raw) return { error: "Product not found" };
  const variants = (raw.variants?.nodes || []).slice(0, 30).map((v) => ({
    variant_id: v.id,
    options: (v.selectedOptions || [])
      .filter((o) => o?.name && !(o.name === "Title" && /^Default( Title)?$/.test(o.value || "")))
      .map((o) => `${o.name}=${o.value}`)
      .join(", ") || undefined,
    price: v.price,
  }));
  const options = (raw.options || [])
    .filter(
      (o) =>
        o?.name &&
        Array.isArray(o.values) &&
        !(o.name === "Title" && o.values.length === 1 && /^Default( Title)?$/.test(o.values[0]))
    )
    .map((o) => `${o.name}: ${o.values.join(", ")}`);
  const min = raw.priceRangeV2?.minVariantPrice;
  const max = raw.priceRangeV2?.maxVariantPrice;
  return {
    title: raw.title,
    description: raw.description
      ? raw.description.replace(/\s+/g, " ").trim().slice(0, 600)
      : undefined,
    price:
      min && max && max.amount !== min.amount
        ? `${min.amount}-${max.amount} ${min.currencyCode || ""}`.trim()
        : min
        ? `${min.amount} ${min.currencyCode || ""}`.trim()
        : undefined,
    options: options.length ? options : undefined,
    single_variant_only: variants.length <= 1 || undefined,
    variants,
  };
}

/**
 * Generate a DM reply with the tool-calling sales agent.
 *
 * @param {Object} params
 * @param {Object} params.shop - shops row (id, shopify_domain)
 * @param {Object} params.message - inbound message row (text, ai_entities, id)
 * @param {string} params.intent - classified intent (hint only; the agent is not routed by it)
 * @param {Object|null} params.brandVoice - brand_voice row (tone, custom_instruction, reply_language)
 * @param {Object|null} params.threadContext - getRecentConversationContext() result
 * @param {boolean} params.allowClarify - whether asking a clarifying question is allowed (plan + settings)
 * @returns {Promise<{text: string, links: Array<{productId, variantId, url, linkId}>} | null>}
 *   null means "couldn't produce a reply" — caller should use the legacy pipeline.
 */
export async function generateAgentReply({
  shop,
  message,
  intent,
  brandVoice,
  threadContext,
  allowClarify,
}) {
  if (!isSalesAgentEnabled()) return null;
  if (!shop?.shopify_domain || !message?.text) return null;

  // Links minted during the loop; logged to links_sent by the caller after send.
  const linksCreated = [];
  // Every URL the model is allowed to include (tool-issued only).
  const allowedUrls = new Set();

  const runTool = async (name, args) => {
    switch (name) {
      case "search_products": {
        let products = await searchCatalogNormalized(shop.shopify_domain, args.query, { limit: 5 });
        if (!products || products.length === 0) {
          products = await searchProductsByDomain(shop.shopify_domain, args.query, 5).catch(() => []);
        }
        const results = formatSearchResults(products);
        return results.length
          ? { results }
          : { results: [], note: "No products matched. Try different search terms, or tell the customer you couldn't find it and suggest what the store does carry (get_store_info lists top products)." };
      }
      case "get_product_details": {
        const gid = toProductGid(args.product_id);
        if (!gid) return { error: "product_id is required" };
        const raw = await getShopifyProductContextForReply(shop.shopify_domain, gid).catch(() => null);
        return formatProductDetails(raw);
      }
      case "get_store_info": {
        let storeInfo = await getStoredStoreContext(shop.id, 0).catch(() => null);
        if (!storeInfo) {
          storeInfo = await getShopifyStoreInfo(shop.shopify_domain).catch(() => null);
        }
        if (!storeInfo) return { error: "Store information is unavailable right now" };
        const built = buildStoreContextForAI(storeInfo);
        // The context builder emits {{token}} placeholders for the legacy
        // sanitizer; the agent gets real URLs instead, which we allowlist and
        // later shorten into tracked info_ links.
        let text = built.text;
        for (const [token, url] of Object.entries(built.urlMap || {})) {
          if (!url) continue;
          text = text.split(token).join(url);
          allowedUrls.add(url);
        }
        return { store_info: text };
      }
      case "get_checkout_link": {
        const gid = toProductGid(args.product_id);
        if (!gid) return { error: "product_id is required" };
        const variantGid = toVariantGid(args.variant_id);
        const qty = Number.isInteger(args.quantity) && args.quantity > 0 ? args.quantity : 1;
        const link = await buildCheckoutLink(shop, gid, variantGid, qty);
        const shortUrl = getClickTrackingUrlForMessage(link.linkId);
        linksCreated.push({ productId: gid, variantId: variantGid, url: link.url, linkId: link.linkId });
        allowedUrls.add(shortUrl);
        return { checkout_url: shortUrl, note: "Paste this URL into your reply exactly as-is." };
      }
      case "get_product_page_link": {
        const gid = toProductGid(args.product_id);
        if (!gid) return { error: "product_id is required" };
        const variantGid = toVariantGid(args.variant_id);
        const pdp = await buildProductPageLink(shop, gid, variantGid);
        if (!pdp) return { error: "Could not build a product page link; use get_checkout_link instead" };
        const shortUrl = getClickTrackingUrlForMessage(pdp.linkId);
        linksCreated.push({ productId: gid, variantId: variantGid, url: pdp.url, linkId: pdp.linkId });
        allowedUrls.add(shortUrl);
        return { product_page_url: shortUrl, note: "Paste this URL into your reply exactly as-is." };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  };

  const systemMessage = buildSystemMessage({ brandVoice, allowClarify });
  const userMessage = buildUserMessage({ message, intent, threadContext });

  const messages = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  let finalText = null;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const forceAnswer = round === MAX_TOOL_ROUNDS;
    const response = await openai.chat.completions.create(
      completionParamsForModel(REPLY_MODEL, {
        model: REPLY_MODEL,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: forceAnswer ? "none" : "auto",
        temperature: 0.4,
        max_tokens: 500,
      })
    );

    const choice = response?.choices?.[0]?.message;
    if (!choice) break;

    if (Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0 && !forceAnswer) {
      messages.push(choice);
      for (const toolCall of choice.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function?.arguments || "{}");
        } catch {
          // leave args empty; the tool will report what's missing
        }
        let result;
        try {
          result = await runTool(toolCall.function?.name, args);
        } catch (err) {
          logger.warn(`[sales-agent] Tool ${toolCall.function?.name} failed: ${err?.message || err}`);
          result = { error: "Tool failed; answer with what you have or say you don't have that information." };
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    finalText = (choice.content || "").trim();
    break;
  }

  if (!finalText) {
    logger.warn(`[sales-agent] No final text produced for message ${message.id}`);
    return null;
  }

  let text = sanitizeReplyText(finalText, allowedUrls);
  if (!text) {
    logger.warn(`[sales-agent] Reply empty after URL sanitization for message ${message.id}`);
    return null;
  }

  // Store policy/page URLs (from get_store_info) are raw storefront URLs —
  // convert them to tracked info_ short links. Checkout/PDP links are already
  // short and are skipped by shortenUrlsInReply.
  text = await shortenUrlsInReply(shop.id, message.id, text);

  logger.debug(
    `[sales-agent] Reply generated for message ${message.id} (${linksCreated.length} tracked links, model=${REPLY_MODEL})`
  );
  return { text, links: linksCreated };
}

function buildSystemMessage({ brandVoice, allowClarify }) {
  const tone = brandVoice?.tone || "friendly";
  const customInstruction = (brandVoice?.custom_instruction || "").trim();

  const languageNames = {
    en: "English",
    "pt-BR": "Brazilian Portuguese",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    nl: "Dutch",
  };
  const forcedLanguage =
    brandVoice?.reply_language && brandVoice.reply_language !== "auto"
      ? languageNames[brandVoice.reply_language]
      : null;
  const languageRule = forcedLanguage
    ? `Write your ENTIRE reply in ${forcedLanguage}, regardless of the language the customer used.`
    : "Write your ENTIRE reply in the same language the customer used. Mirror their language exactly.";

  const styleRule = customInstruction
    ? `STYLE (follow exactly): ${customInstruction}. Do not default to friendly/enthusiastic unless this instruction says so.`
    : `STYLE: ${tone} tone.`;

  const vagueRule = allowClarify
    ? `- If their message is too vague to know which product they mean, ask ONE short clarifying question instead of guessing.`
    : `- If their message is too vague to know which product they mean, don't interrogate them — point them to browsing the store (get_store_info has an all-products link) or your best-guess product.`;

  return `You are the store's sales associate on Instagram, replying to a customer DM. Think of the best boutique retail associate: warm, knowledgeable, genuinely helpful, and good at closing a sale without being pushy.

You have tools to look up live store data. Use them — never answer from assumption:
- search_products: find products in the catalog
- get_product_details: options, variants, prices, description for one product
- get_store_info: policies (shipping/returns/etc.), pages, contact email, product count
- get_checkout_link / get_product_page_link: create the tracked links you paste into replies

HOW TO SELL:
- Answer their actual question first, accurately and specifically (exact prices, exact options).
- If the exact thing they want isn't available, search for the closest alternative and offer it — don't just say no.
- When they show buying intent, create a checkout link and include it naturally.
- If a product comes in multiple sizes/colors and they want to buy but haven't chosen, ask which one they want (list the options) rather than sending a generic link.
${vagueRule}
- When you genuinely can't help with the info available, say so honestly and give the store's contact email from get_store_info.

HARD RULES:
- NEVER invent information: no made-up prices, products, policies, emails, or URLs.
- Every URL in your reply must be copied character-for-character from a tool result. Never write, modify, or shorten a URL yourself. At most 2 links per reply.
- ${languageRule}
- ${styleRule}
- Instagram DMs are plain text: no markdown, no [text](url) links — write a short lead-in then the bare URL.
- Keep it short: 2-4 sentences, like a real DM. No sign-offs, no "feel free to reach out".`;
}

function buildUserMessage({ message, intent, threadContext }) {
  const parts = [];

  const recent = (threadContext?.messages || [])
    .filter((m) => m.id !== message.id)
    .slice(0, 8)
    .reverse()
    .map((m) => `- ${m.channel === "comment" ? "Comment" : "DM"}: ${m.text || "(no text)"}`);
  if (recent.length) {
    parts.push(`Recent conversation (oldest first):\n${recent.join("\n")}`);
  }

  const lastProductLink = threadContext?.lastProductLink;
  if (lastProductLink?.product_id) {
    parts.push(
      `The conversation is about a specific product already (e.g. they commented on a post for it). product_id: ${toProductGid(lastProductLink.product_id)}${
        lastProductLink.variant_id ? `, variant_id: ${toVariantGid(lastProductLink.variant_id)}` : ""
      }. Prefer this product unless their message is clearly about something else.`
    );
  }

  const entityProduct = message.ai_entities?.product_name;
  if (entityProduct) {
    parts.push(`They seem to be referring to a product called: "${entityProduct}"`);
  }
  if (intent) {
    parts.push(`Classifier's intent guess (may be wrong, trust the message itself): ${intent}`);
  }

  parts.push(`Customer's message: "${message.text}"`);
  parts.push("Write the reply now (use tools first if you need data).");
  return parts.join("\n\n");
}

/**
 * Strip markdown link syntax and any URL that didn't come from a tool result.
 */
function sanitizeReplyText(text, allowedUrls) {
  let result = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 $2");

  const urlRegex = /https?:\/\/[^\s)]+/g;
  result = result.replace(urlRegex, (matched) => {
    const normalized = matched.replace(/[.,;:!?)\]\s]+$/g, "").trim();
    const trailing = matched.slice(normalized.length);
    for (const allowed of allowedUrls) {
      if (normalized === allowed || normalized.startsWith(allowed + "?") || normalized.startsWith(allowed + "/")) {
        return normalized + trailing;
      }
    }
    return "";
  });

  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.!?,;])/g, "$1")
    .replace(/([.!?,;])\1+/g, "$1")
    .trim();
}
