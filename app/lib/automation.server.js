/**
 * Automation Functions for DM-to-Buy
 * Handles checkout link generation, DM sending, and message processing
 */

import { randomUUID } from "crypto";
import OpenAI from "openai";
import { getShopPlanAndUsage, incrementUsage, logLinkSent, alreadyRepliedToMessage, alreadyRepliedToExternalMessage, claimMessageReply, claimCommentReply } from "./db.server";
import { getProductMappings } from "./db.server";
import { getSettings, getBrandVoice } from "./db.server";
import { getRecentConversationContext } from "./db.server";
import { getShopifyProductInfo, buildStoreContextForAI, getShopifyProductContextForReply, buildProductContextForAI, getShopifyStoreInfo } from "./shopify-data.server";
import { sendInstagramPrivateReply, sendInstagramDm, getMetaAuth } from "./meta.server";
import supabase from "./supabase.server";
import { canSendForShop, sendDmNow } from "./queue.server";
import { sessionStorage } from "../shopify.server";
import shopify from "../shopify.server";

// Module-level singleton — one HTTP connection pool for the lifetime of the process.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/**
 * Generate a unique link_id (UUID format, stored as TEXT)
 */
function generateLinkId() {
  return randomUUID();
}

/**
 * URL for click tracking: user hits this, we log the click and redirect to the real URL.
 * Used so analytics "clicks" count works (links_sent.url is the destination; we store it and redirect).
 */
function getClickTrackingUrl(linkId) {
  const base = (process.env.SHOPIFY_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/c/${linkId}`;
}

/**
 * Tracking URL to show in messages.
 * Uses the app's own /c/{linkId} redirect — this IS the short link (no external service needed).
 * External URL shorteners were removed from the webhook hot path to reduce latency and
 * eliminate external failure surfaces on the critical 20-second Meta webhook deadline.
 */
function getClickTrackingUrlForMessage(linkId) {
  return getClickTrackingUrl(linkId);
}

function getShopDomainHost(shop) {
  const rawDomain = shop?.shopify_domain;
  if (!rawDomain) return null;
  try {
    const url = rawDomain.includes("://")
      ? new URL(rawDomain)
      : new URL(`https://${rawDomain}`);
    return url.hostname;
  } catch (error) {
    console.warn(`[automation] Invalid shopify_domain: ${rawDomain}`);
    return null;
  }
}

function getShopHomepageUrl(shop) {
  const host = getShopDomainHost(shop);
  return host ? `https://${host}` : null;
}

// External URL shortener removed from the webhook hot path.
// The app's own /c/{linkId} tracking URL is used in DMs instead.
// If you want branded short links, shorten asynchronously after the message is sent
// and update links_sent.url — do not block the webhook response on an external fetch.

/**
 * Build a Shopify product detail page (PDP) link.
 * Always uses product HANDLE in the path (/products/{handle}), never numeric ID.
 * @param {Object} shop - Shop object with shopify_domain
 * @param {string} productId - Shopify product ID (gid format)
 * @param {string|null} variantId - Shopify variant ID (gid format, optional)
 * @param {string|null} productHandle - Product handle (optional; fetched from API if missing)
 * @returns {Promise<string>} - Product detail page URL
 */
export async function buildProductPageLink(shop, productId, variantId = null, productHandle = null, _shorten = true) {
  const shopHost = getShopDomainHost(shop);
  if (!shopHost) {
    throw new Error("Shop domain is required");
  }

  if (!productId) {
    throw new Error("Product ID is required");
  }

  let handle = (productHandle || "").trim() || null;
  if (!handle && shop.shopify_domain) {
    const raw = await getShopifyProductContextForReply(shop.shopify_domain, productId);
    handle = (raw?.handle || "").trim() || null;
  }
  if (!handle) {
    throw new Error("Product handle is required for PDP URL; could not resolve from product ID. Ensure the product exists and the app has read_products scope.");
  }

  const variantIdMatch = variantId ? variantId.match(/\/(\d+)$/) : null;

  // Always use handle in path (Shopify storefront expects /products/{handle})
  const pdpUrl = `https://${shopHost}/products/${handle}`;

  // Add variant parameter if provided
  const params = new URLSearchParams();
  if (variantIdMatch) {
    params.set("variant", variantIdMatch[1]);
  }
  
  // Add UTM parameters
  params.set("utm_source", "instagram");
  params.set("utm_medium", "ig_dm");
  params.set("utm_campaign", "product_question");

  const finalUrl = params.toString() ? `${pdpUrl}?${params.toString()}` : pdpUrl;
  return finalUrl;
}

/**
 * Build a Shopify checkout/cart link with UTMs and link_id
 * @param {Object} shop - Shop object with shopify_domain
 * @param {string} productId - Shopify product ID (gid format)
 * @param {string|null} variantId - Shopify variant ID (gid format, optional)
 * @param {number} qty - Quantity (default: 1)
 * @returns {Promise<{url: string, linkId: string}>} - Checkout URL and link ID
 */
export async function buildCheckoutLink(shop, productId, variantId = null, qty = 1, _shorten = true) {
  const shopHost = getShopDomainHost(shop);
  if (!shopHost) {
    throw new Error("Shop domain is required");
  }

  if (!productId) {
    throw new Error("Product ID is required");
  }

  // Generate unique link_id
  const linkId = generateLinkId();

  // Extract numeric IDs from GID format
  // Product ID format: gid://shopify/Product/123456789
  // Variant ID format: gid://shopify/ProductVariant/123456789
  const productIdMatch = productId.match(/\/(\d+)$/);
  
  // If variant_id is null, try to fetch the first variant from Shopify
  let finalVariantId = variantId;
  if (!finalVariantId) {
    try {
      // Get session from storage using shop domain
      const sessionId = `${shop.shopify_domain}_${process.env.SHOPIFY_API_KEY}`;
      const session = await sessionStorage.loadSession(sessionId);
      
      if (session && session.accessToken) {
        // Create GraphQL client using the session
        const admin = new shopify.clients.Graphql({ session });
        
        const response = await admin.graphql(`
          query getProduct($id: ID!) {
            product(id: $id) {
              id
              variants(first: 1) {
                nodes {
                  id
                }
              }
            }
          }
        `, {
          variables: { id: productId },
        });

        const json = await response.json();
        const variants = json.data?.product?.variants?.nodes || [];
        if (variants.length > 0) {
          finalVariantId = variants[0].id;
          console.log(`[buildCheckoutLink] Fetched first variant: ${finalVariantId}`);
        }
      }
    } catch (error) {
      // If we can't fetch the variant, continue without it
      console.warn(`[buildCheckoutLink] Could not fetch default variant for product ${productId}:`, error.message);
    }
  }
  
  // Validate variant_id is actually a variant ID (not a product ID)
  // Handle both GID format (gid://shopify/ProductVariant/123) and numeric format (123)
  let variantNumericId = null;
  if (finalVariantId) {
    // Check if it's a GID format with ProductVariant
    if (finalVariantId.includes("ProductVariant")) {
      const variantIdMatch = finalVariantId.match(/\/(\d+)$/);
      variantNumericId = variantIdMatch ? variantIdMatch[1] : null;
    } else if (typeof finalVariantId === "string" && /^\d+$/.test(finalVariantId)) {
      // If it's just a numeric string, use it directly
      variantNumericId = finalVariantId;
    } else if (typeof finalVariantId === "number") {
      // If it's a number, convert to string
      variantNumericId = String(finalVariantId);
    } else {
      // If variantId doesn't match expected formats, log warning and treat as null
      console.warn(`[buildCheckoutLink] Invalid variant_id format: ${finalVariantId} (type: ${typeof finalVariantId})`);
      variantNumericId = null;
    }
  }

  if (!productIdMatch) {
    throw new Error("Invalid product ID format");
  }

  const productNumericId = productIdMatch[1];

  // Build the checkout URL
  // Using cart permalink format: /cart/{variant_id}:{qty} (Shopify's official permalink format)
  // Only use this format if we have a valid variant ID
  let checkoutUrl;
  if (variantNumericId) {
    // Use variant-specific cart permalink
    checkoutUrl = `https://${shopHost}/cart/${variantNumericId}:${qty}`;
  } else {
    // Use product cart URL (will use default variant)
    checkoutUrl = `https://${shopHost}/cart/add?id=${productNumericId}&quantity=${qty}`;
  }

  // Add UTM parameters and link_id
  const params = new URLSearchParams({
    ref: `link_${linkId}`,
    utm_source: "instagram",
    utm_medium: "ig_dm",
    utm_campaign: "dm_to_buy",
  });

  const finalUrl = `${checkoutUrl}?${params.toString()}`;

  return {
    url: finalUrl,
    linkId: linkId,
  };
}

/**
 * Send a DM reply via Instagram Messaging API
 * @param {string} shopId - Shop UUID
 * @param {string} igUserId - Instagram user ID (recipient)
 * @param {string} text - Message text
 * @returns {Promise<Object>} - API response
 */
export async function sendDmReply(shopId, igUserId, text) {
  if (!shopId || !igUserId || !text) {
    throw new Error("shopId, igUserId, and text are required");
  }

  if (await canSendForShop(shopId)) {
    try {
      await sendDmNow(shopId, igUserId, text);
      return { sent: true };
    } catch (error) {
      console.error("[automation] Error sending DM immediately, queueing:", error);
      // Fall through to queue
    }
  }

  const { error } = await supabase.from("outbound_dm_queue").insert({
    shop_id: shopId,
    ig_user_id: String(igUserId),
    text,
    status: "pending",
  });

  if (error) {
    console.error("[automation] Error enqueueing DM:", error);
    throw new Error("Failed to queue DM message");
  }

  return { queued: true };
}

/**
 * Process an incoming DM and send automated reply if conditions are met
 * @param {Object} message - Message object from database
 * @param {Object} shop - Shop object
 * @param {Object} plan - Plan object
 * @returns {Promise<{sent: boolean, reason?: string}>} - Whether message was sent and reason
 */
export async function handleIncomingDm(message, shop, plan) {
  try {
    // 0. Meta compliance: only one automated reply per incoming message
    if (message.external_id && (await alreadyRepliedToExternalMessage(shop.id, message.external_id))) {
      console.log(`[automation] Already replied to external message ${message.external_id}, skipping`);
      return { sent: false, reason: "Already replied to this external message" };
    }
    if (await alreadyRepliedToMessage(message.id)) {
      console.log(`[automation] Already replied to message ${message.id}, skipping (one reply per message)`);
      return { sent: false, reason: "Already replied to this message" };
    }

    // 1. Check publish mode: if dm_automation_enabled = false, skip automation
    const settings = await getSettings(shop.id);
    if (settings?.dm_automation_enabled === false) {
      console.log(`[automation] DM automation disabled for shop ${shop.id}`);
      return { sent: false, reason: "DM automation disabled" };
    }

    // Follow-up automation toggle (PRO). When disabled, we do NOT ask clarifying questions.
    const followupAutomationEnabled = settings?.followup_enabled === true;

    // 1.5. Meta Compliance: Check for opt-out keywords (STOP, UNSUBSCRIBE, OPT OUT)
    const optOutKeywords = ["stop", "unsubscribe", "opt out", "optout", "cancel", "no messages"];
    const messageTextLower = (message.text || "").toLowerCase();
    if (optOutKeywords.some(keyword => messageTextLower.includes(keyword))) {
      console.log(`[automation] Opt-out keyword detected in message ${message.id}, skipping automation`);
      return { sent: false, reason: "User opted out of automated messages" };
    }

    // 1.6. Meta Compliance: Verify message is within 24-hour messaging window
    // For initial messages, this is always true (they just sent it)
    // For follow-ups, canSendFollowUp already checks this, but we verify here for clarity
    if (message.last_user_message_at) {
      const lastMessageTime = new Date(message.last_user_message_at);
      const now = new Date();
      const hoursSinceLastMessage = (now - lastMessageTime) / (1000 * 60 * 60);
      if (hoursSinceLastMessage >= 24) {
        console.log(`[automation] Message ${message.id} is outside 24-hour messaging window (${hoursSinceLastMessage.toFixed(1)} hours), skipping automation`);
        return { sent: false, reason: "Outside 24-hour messaging window" };
      }
    }

    // 2. Enforce usage cap for all plans
    const usageData = await getShopPlanAndUsage(shop.id);
    if (usageData.usage >= plan.cap) {
      console.log(`[automation] Usage cap exceeded for ${plan.name} shop ${shop.id}: ${usageData.usage}/${plan.cap}`);
      return { sent: false, reason: "Usage cap exceeded" };
    }

    // 3. Check if this is a follow-up (conversation support for Growth/Pro)
    const isFollowUp = await canSendFollowUp(message, shop, plan);

    // For FREE plan, only allow first reply (no follow-ups)
    if (plan.name === "FREE" && isFollowUp) {
      console.log(`[automation] Follow-up DMs not available on FREE plan`);
      return { sent: false, reason: "Follow-up DMs not available on FREE plan" };
    }

    // 4. Determine intent + fetch recent thread context (so replies after follow-ups can be contextual)
    // Note: price_request indicates purchase intent, so we should respond with checkout link
    const productSpecificIntents = ["purchase", "product_question", "variant_inquiry", "price_request"];
    const generalIntents = ["store_question"];
    const eligibleIntents = [...productSpecificIntents, ...generalIntents];

    let threadContext = null;
    if (message.from_user_id) {
      try {
        threadContext = await getRecentConversationContext(shop.id, message.from_user_id, {
          windowHours: 72,
          maxMessages: 25,
          maxLinks: 25,
        });
      } catch (error) {
        console.error("[automation] Error fetching thread context:", error);
      }
    }

    const lastProductLink = threadContext?.lastProductLink || null;
    const hasPriorProductContext = !!lastProductLink?.product_id;
    const originChannel = threadContext?.originChannel || "dm";

    // Try to infer intent for low-context follow-up replies when we DO have product context.
    // This helps the experience when users reply to follow-ups with messages like "yes" or "link?".
    const inferIntentFromText = (text) => {
      const t = (text || "").trim().toLowerCase();
      if (!t) return null;

      if (/(how much|price|\$)/.test(t)) return "price_request";
      if (/(size|sizes|color|colours|variant|variants|options)/.test(t)) return "variant_inquiry";
      if (/(buy|purchase|checkout|add to cart|take it|i'll take|ill take|send the link|link\??)/.test(t)) {
        return "purchase";
      }

      if (["yes", "yeah", "yep", "ok", "okay", "sure", "please", "pls"].includes(t)) {
        return "purchase";
      }

      return null;
    };

    let intent = message.ai_intent || null;
    if (!intent || !eligibleIntents.includes(intent)) {
      // If we have prior product context, try a lightweight inference.
      if (hasPriorProductContext) {
        intent = inferIntentFromText(message.text);
      }
    }

    if (!intent || !eligibleIntents.includes(intent)) {
      console.log(`[automation] AI intent "${message.ai_intent}" not eligible for automation`);
      return { sent: false, reason: `AI intent "${message.ai_intent || "none"}" not eligible` };
    }

    // 5. Handle store_question (general store questions) - doesn't need product mapping
    if (intent === "store_question") {
      // Get brand voice and generate reply message for store questions
      const brandVoiceData = await getBrandVoice(shop.id);
      
      // Fetch store-specific information from Shopify using shop domain
      let storeInfo = null;
      if (shop.shopify_domain) {
        try {
          storeInfo = await getShopifyStoreInfo(shop.shopify_domain);
          if (storeInfo) {
            console.log(`[automation] Fetched store info for ${shop.shopify_domain}:`, {
              hasRefundPolicy: !!storeInfo.refundPolicy,
              refundPolicyTitle: storeInfo.refundPolicy?.title,
              refundPolicyBodyLength: storeInfo.refundPolicy?.body?.length || 0,
              refundPolicyUrl: storeInfo.refundPolicy?.url,
              storeEmail: storeInfo.email,
            });
          } else {
            console.log(`[automation] Could not fetch store info for ${shop.shopify_domain} (session may not exist)`);
          }
        } catch (error) {
          console.error(`[automation] Error fetching store info for ${shop.shopify_domain}:`, error);
          // Continue without store info - AI can still answer based on question content
        }
      }
      
      const replyText = await generateReplyMessage(
        brandVoiceData,
        null,
        null,
        intent,
        null,
        null,
        message.text,
        storeInfo, // Pass store-specific information to AI
        {
          originChannel,
          inboundChannel: "dm",
          triggerChannel: originChannel,
          lastProductLink: lastProductLink
            ? {
                url: lastProductLink.url,
                product_id: lastProductLink.product_id,
                variant_id: lastProductLink.variant_id,
                trigger_channel: lastProductLink.trigger_channel,
              }
            : null,
          recentMessages: (threadContext?.messages || [])
            .filter((m) => m.id !== message.id)
            .slice(0, 8)
            .map((m) => ({ channel: m.channel, text: m.text, created_at: m.created_at })),
        }
      );

      // Claim the one-reply slot (atomic); if duplicate webhook, only one wins
      if (!(await claimMessageReply(shop.id, message.id, replyText, message.external_id))) {
        console.log(`[automation] Reply already claimed for message ${message.id}, skipping send`);
        return { sent: false, reason: "Already replied to this message" };
      }
      await sendDmReply(shop.id, message.from_user_id, replyText);
      await incrementUsage(shop.id, 1);

      console.log(`[automation] ✅ Automated DM sent for store question ${message.id}`);
      return { sent: true };
    }

    // 6. Product-specific intents in DMs:
    // - If we have prior product context (e.g. started from comment->DM), reuse it.
    // - Otherwise, PRO can ask a clarifying question; non-PRO should not respond.
    if (productSpecificIntents.includes(intent)) {
      if (hasPriorProductContext) {
        const productMapping = {
          product_id: lastProductLink.product_id,
          variant_id: lastProductLink.variant_id || null,
          product_handle: null,
        };

        // Generate links - use PDP link for product_question and variant_inquiry, checkout link for others
        let productPageUrl = null;
        let checkoutUrl = null;
        let linkId = null;

        if (intent === "product_question" || intent === "variant_inquiry") {
          productPageUrl = await buildProductPageLink(
            shop,
            productMapping.product_id,
            productMapping.variant_id,
            productMapping.product_handle
          );
          const checkoutLink = await buildCheckoutLink(
            shop,
            productMapping.product_id,
            productMapping.variant_id,
            1
          );
          checkoutUrl = checkoutLink.url;
          linkId = checkoutLink.linkId;
        } else {
          const checkoutLink = await buildCheckoutLink(
            shop,
            productMapping.product_id,
            productMapping.variant_id,
            1
          );
          checkoutUrl = checkoutLink.url;
          linkId = checkoutLink.linkId;
        }

        // Get brand voice and generate reply message
        const brandVoiceData = await getBrandVoice(shop.id);
        let productName = null;
        let productPrice = null;
        if (shop.shopify_domain && productMapping.product_id) {
          const info = await getShopifyProductInfo(
            shop.shopify_domain,
            productMapping.product_id,
            productMapping.variant_id || null
          );
          productName = info.productName;
          productPrice = info.productPrice;
        }

        const checkoutUrlForMessage = getClickTrackingUrlForMessage(linkId) || checkoutUrl;
        const replyText = await generateReplyMessage(
          brandVoiceData,
          productName,
          checkoutUrlForMessage,
          intent,
          productPrice,
          productPageUrl,
          message.text,
          null,
          {
            originChannel,
            inboundChannel: "dm",
            triggerChannel: originChannel,
            lastProductLink: {
              url: lastProductLink.url,
              product_id: lastProductLink.product_id,
              variant_id: lastProductLink.variant_id,
              trigger_channel: lastProductLink.trigger_channel,
            },
            recentMessages: (threadContext?.messages || [])
              .filter((m) => m.id !== message.id)
              .slice(0, 8)
              .map((m) => ({ channel: m.channel, text: m.text, created_at: m.created_at })),
          }
        );

        if (!(await claimMessageReply(shop.id, message.id, replyText, message.external_id))) {
          console.log(`[automation] Reply already claimed for message ${message.id}, skipping send`);
          return { sent: false, reason: "Already replied to this message" };
        }
        await sendDmReply(shop.id, message.from_user_id, replyText);
        await incrementUsage(shop.id, 1);

        await logLinkSent({
          shopId: shop.id,
          messageId: message.id,
          productId: productMapping.product_id,
          variantId: productMapping.variant_id,
          url: (intent === "product_question" || intent === "variant_inquiry") && productPageUrl
            ? productPageUrl
            : checkoutUrl,
          linkId: linkId,
          replyText: replyText,
        });

        console.log(
          `[automation] ✅ Contextual DM reply sent for message ${message.id} (origin=${originChannel})`
        );
        return { sent: true };
      }

      // No prior product context => Direct DM without context
      if (plan.followup === true && followupAutomationEnabled) {
        // Meta Compliance: loop prevention - don't ask clarifying question multiple times
        const { data: recentClarifyingQuestions } = await supabase
          .from("links_sent")
          .select("id, sent_at, message_id")
          .eq("shop_id", shop.id)
          .is("url", null) // Clarifying questions have no URL
          .not("reply_text", "is", null)
          .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (recentClarifyingQuestions && recentClarifyingQuestions.length > 0) {
          const clarifyingMessageIds = recentClarifyingQuestions.map((q) => q.message_id);
          const { data: clarifyingMessages } = await supabase
            .from("messages")
            .select("id, from_user_id")
            .in("id", clarifyingMessageIds)
            .eq("from_user_id", message.from_user_id);

          if (clarifyingMessages && clarifyingMessages.length >= 2) {
            console.log(
              `[automation] Loop prevention: Already sent ${clarifyingMessages.length} clarifying questions to user ${message.from_user_id} in last 24 hours, skipping`
            );
            return {
              sent: false,
              reason:
                "Loop prevention: Maximum clarifying questions reached. Please contact support for assistance.",
            };
          }
        }

        console.log(
          `[automation] Direct DM without product context - PRO tier will ask for clarification for intent: ${intent}`
        );

        const brandVoiceData = await getBrandVoice(shop.id);
        const clarifyingReply = await generateClarifyingQuestion(
          brandVoiceData,
          message.text,
          intent,
          { originChannel: "dm", inboundChannel: "dm" }
        );

        if (!(await claimMessageReply(shop.id, message.id, clarifyingReply, message.external_id))) {
          console.log(`[automation] Reply already claimed for message ${message.id}, skipping send`);
          return { sent: false, reason: "Already replied to this message" };
        }
        await sendDmReply(shop.id, message.from_user_id, clarifyingReply);
        await incrementUsage(shop.id, 1);

        await logLinkSent({
          shopId: shop.id,
          messageId: message.id,
          productId: null,
          variantId: null,
          url: null,
          linkId: null,
          replyText: clarifyingReply,
        });

        console.log(`[automation] ✅ Clarifying question sent for Direct DM ${message.id}`);
        return { sent: true, reason: "PRO tier: Asked customer which product they're referring to" };
      }

      console.log(
        `[automation] Direct DM without product context - skipping product-specific automation for intent: ${intent} (follow-up automation disabled or unavailable)`
      );
      return {
        sent: false,
        reason:
          followupAutomationEnabled
            ? "Direct DM without product context - cannot determine which product customer is referring to"
            : "Follow-up automation is disabled — cannot ask clarifying questions, so no automated response will be sent",
      };
    }

    // Safety: no other DM intents are currently supported.
    return { sent: false, reason: `AI intent "${intent}" not supported for DM automation` };
  } catch (error) {
    console.error(`[automation] Error processing DM ${message.id}:`, error);
    return { sent: false, reason: error.message || "Unknown error" };
  }
}

/**
 * Check if a comment has already received an automated DM reply.
 * We key by link_id = dm_reply_comment_${commentId} so one reply per Instagram comment regardless of message row.
 */
async function hasCommentBeenReplied(commentId, shopId) {
  if (!commentId || !shopId) return false;
  const linkId = `dm_reply_comment_${commentId}`;
  const { data } = await supabase
    .from("links_sent")
    .select("id")
    .eq("shop_id", shopId)
    .eq("link_id", linkId)
    .limit(1);

  return (data && data.length > 0);
}

/**
 * Process an incoming comment and send private DM reply if conditions are met (Growth/Pro only)
 * @param {Object} message - Comment message object from database
 * @param {string} mediaId - Instagram media ID the comment is on
 * @param {Object} shop - Shop object
 * @param {Object} plan - Plan object
 * @returns {Promise<{sent: boolean, reason?: string}>} - Whether DM was sent and reason
 */
export async function handleIncomingComment(message, mediaId, shop, plan) {
  try {
    // 1. Only for Growth/Pro plans
    if (plan.name === "FREE") {
      console.log(`[automation] Comment-to-DM automation only available for Growth/Pro plans`);
      return { sent: false, reason: "Feature not available on FREE plan" };
    }

    // 2. Check publish mode: comment_automation_enabled must be true
    const settings = await getSettings(shop.id);
    if (settings?.comment_automation_enabled === false) {
      console.log(`[automation] Comment automation disabled for shop ${shop.id}`);
      return { sent: false, reason: "Comment automation disabled" };
    }


    // 3. Enforce usage cap for all plans
    const usageData = await getShopPlanAndUsage(shop.id);
    if (usageData.usage >= plan.cap) {
      console.log(`[automation] Usage cap exceeded for ${plan.name} shop ${shop.id}: ${usageData.usage}/${plan.cap}`);
      return { sent: false, reason: "Usage cap exceeded" };
    }

    // 4. Check AI intent and confidence threshold (0.7)
    // Note: price_request indicates purchase intent, so we should respond with checkout link
    const eligibleIntents = ["purchase", "product_question", "variant_inquiry", "price_request"];
    if (!message.ai_intent || !eligibleIntents.includes(message.ai_intent)) {
      console.log(`[automation] Comment AI intent "${message.ai_intent}" not eligible`);
      return { sent: false, reason: `AI intent "${message.ai_intent}" not eligible` };
    }

    if (!message.ai_confidence || message.ai_confidence < 0.7) {
      console.log(`[automation] Comment confidence ${message.ai_confidence} below threshold (0.7)`);
      return { sent: false, reason: `Confidence ${message.ai_confidence} below threshold` };
    }

    // 5. Check if we've already replied to this comment (7-day window check)
    const commentAge = new Date() - new Date(message.created_at);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (commentAge > sevenDaysMs) {
      console.log(`[automation] Comment is older than 7 days, cannot reply`);
      return { sent: false, reason: "Comment older than 7 days" };
    }

    // Support both Supabase snake_case (external_id) and camelCase
    const commentExternalId = message.external_id ?? message.externalId;
    const alreadyReplied = commentExternalId
      ? await hasCommentBeenReplied(commentExternalId, shop.id)
      : await alreadyRepliedToMessage(message.id);
    if (alreadyReplied) {
      console.log(`[automation] Already replied to comment/message ${commentExternalId ?? message.id}`);
      return { sent: false, reason: "Already replied to this comment" };
    }

    // 6. Find product mapping for this media
    const productMappings = await getProductMappings(shop.id);
    const productMapping = productMappings.find((m) => m.ig_media_id === mediaId);

    if (!productMapping) {
      const homepageUrl = getShopHomepageUrl(shop);
      if (!homepageUrl) {
        console.log(`[automation] No product mapping found for media ${mediaId} and no shop domain`);
        return { sent: false, reason: "No product mapping found and no shop domain" };
      }

      console.log(`[automation] No product mapping found for media ${mediaId}; sending homepage link`);
      const brandVoiceData = await getBrandVoice(shop.id);
      const replyText = await generateReplyMessage(
        brandVoiceData,
        null,
        homepageUrl,
        message.ai_intent,
        null,
        null,
        message.text,
        null,
        {
          originChannel: "comment",
          inboundChannel: "comment",
          triggerChannel: "comment",
          isHomepageFallback: true,
          lastProductLink: {
            url: homepageUrl,
            product_id: null,
            variant_id: null,
            trigger_channel: "comment",
          },
          recentMessages: [{ channel: "comment", text: message.text, created_at: message.created_at }],
        }
      );

      const commentExternalId = message.external_id ?? message.externalId;
      const claimed = commentExternalId
        ? await claimCommentReply(shop.id, commentExternalId, replyText, message.id)
        : await claimMessageReply(shop.id, message.id, replyText, message.external_id);
      if (!claimed) {
        console.log(`[automation] Reply already claimed for comment/message ${commentExternalId ?? message.id}, skipping send`);
        return { sent: false, reason: "Already replied to this comment" };
      }
      // Test webhook uses fake comment IDs (test_comment_*); send as DM to commenter so message appears in Instagram
      const fromUserId = message.from_user_id ?? message.fromUserId;
      if (commentExternalId.startsWith("test_comment_") && fromUserId) {
        await sendInstagramDm(shop.id, fromUserId, replyText);
        console.log(`[automation] ✅ Comment test reply sent as DM to user ${fromUserId} (homepage link)`);
      } else {
        await sendInstagramPrivateReply(shop.id, commentExternalId, replyText);
        console.log(`[automation] ✅ Comment private reply sent with homepage link for comment ${message.id}`);
      }
      await incrementUsage(shop.id, 1);
      return { sent: true };
    }

    // 7. Generate links - use PDP link for product_question and variant_inquiry, checkout link for others
    let productPageUrl = null;
    let checkoutUrl = null;
    let linkId = null;

    // For product/variant questions: fetch product context first (so we have handle + variant info), then build full PDP URL (no shortening)
    let rawProductContext = null;
    if (shop.shopify_domain && productMapping.product_id && (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry")) {
      rawProductContext = await getShopifyProductContextForReply(shop.shopify_domain, productMapping.product_id);
    }

    if (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry") {
      // Prefer stored product_handle so PDP URL works in webhooks without calling Shopify Admin API
      const productHandle = (productMapping.product_handle || rawProductContext?.handle || "").trim() || null;
      productPageUrl = await buildProductPageLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        productHandle,
        true
      );
      const checkoutLink = await buildCheckoutLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        1
      );
      checkoutUrl = checkoutLink.url;
      linkId = checkoutLink.linkId;
    } else {
      const checkoutLink = await buildCheckoutLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        1
      );
      checkoutUrl = checkoutLink.url;
      linkId = checkoutLink.linkId;
    }

    // 8. Get brand voice, product info, and product context (for variant/product questions)
    const brandVoiceData = await getBrandVoice(shop.id);
    let productName = null;
    let productPrice = null;
    let productContextForReply = null;
    if (shop.shopify_domain && productMapping.product_id) {
      const info = await getShopifyProductInfo(
        shop.shopify_domain,
        productMapping.product_id,
        productMapping.variant_id || null
      );
      productName = info.productName;
      productPrice = info.productPrice;
      if (rawProductContext) {
        productContextForReply = buildProductContextForAI(rawProductContext);
        const variantCount = rawProductContext?.variants?.nodes?.length ?? 0;
        console.log(
          `[automation] Product context attached for comment reply: productId=${productMapping.product_id} variantCount=${variantCount} contextLength=${productContextForReply?.text?.length ?? 0} preview=${(productContextForReply?.text ?? "").substring(0, 120).replace(/\n/g, " ")}...`
        );
      } else if (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry") {
        productContextForReply = {
          text: "Product variant data could not be loaded. Do not assume this product has multiple sizes or colors. If the customer asks about options/variants, say you don't have that information or that it only comes in one option.",
        };
      }
    }
    const checkoutUrlForMessage = getClickTrackingUrlForMessage(linkId) || checkoutUrl;
    const replyText = await generateReplyMessage(
      brandVoiceData,
      productName,
      checkoutUrlForMessage,
      message.ai_intent,
      productPrice,
      productPageUrl,
      message.text,
      null,
      {
        originChannel: "comment",
        inboundChannel: "comment",
        triggerChannel: "comment",
        lastProductLink: {
          url: (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry") && productPageUrl
            ? productPageUrl
            : checkoutUrl,
          product_id: productMapping.product_id,
          variant_id: productMapping.variant_id,
          trigger_channel: "comment",
        },
        recentMessages: [{ channel: "comment", text: message.text, created_at: message.created_at }],
      },
      productContextForReply
    );

    const claimed = commentExternalId
      ? await claimCommentReply(shop.id, commentExternalId, replyText, message.id)
      : await claimMessageReply(shop.id, message.id, replyText, message.external_id);
    if (!claimed) {
      console.log(`[automation] Reply already claimed for comment/message ${commentExternalId ?? message.id}, skipping send`);
      return { sent: false, reason: "Already replied to this comment" };
    }
    // 9. Send private reply to the comment (within 7 days). Test webhook uses fake comment IDs; send as DM to commenter.
    if (!commentExternalId) {
      console.warn("[automation] Missing comment ID for private reply");
      return { sent: false, reason: "Missing comment ID for private reply" };
    }
    const fromUserId = message.from_user_id ?? message.fromUserId;
    if (commentExternalId.startsWith("test_comment_") && fromUserId) {
      await sendInstagramDm(shop.id, fromUserId, replyText);
      console.log(`[automation] ✅ Comment test reply sent as DM to user ${fromUserId} for comment ${message.id}`);
    } else {
      await sendInstagramPrivateReply(shop.id, commentExternalId, replyText);
    }

    // 10. Increment usage count
    await incrementUsage(shop.id, 1);

    // 11. Log the sent link (comment claim already recorded via claimCommentReply)
    await logLinkSent({
      shopId: shop.id,
      messageId: message.id, // Link this to the comment message
      productId: productMapping.product_id,
      variantId: productMapping.variant_id,
      url: (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry") && productPageUrl ? productPageUrl : checkoutUrl,
      linkId: linkId,
      replyText: replyText,
    });

    console.log(`[automation] ✅ Comment private reply sent successfully for comment ${message.id}`);
    return { sent: true };
  } catch (error) {
    console.error(`[automation] Error processing comment ${message.id}:`, error);
    return { sent: false, reason: error.message || "Unknown error" };
  }
}

/**
 * Generate a clarifying question asking which product the customer is referring to
 * Used for Direct DMs with product-specific intents when no product context is available (PRO tier only)
 * @param {Object} brandVoice - Brand voice configuration
 * @param {string} originalMessage - The customer's original message
 * @param {string} intent - The detected intent (purchase, product_question, etc.)
 * @returns {Promise<string>} - The clarifying question message
 */
export async function generateClarifyingQuestion(brandVoice, originalMessage, intent, channelContext = null) {
  const tone = brandVoice?.tone || "friendly";
  const customInstruction = brandVoice?.custom_instruction || "";

  try {
    if (openai) {
      const intentContext = {
        purchase: "wants to buy a product",
        product_question: "asked a question about a product",
        variant_inquiry: "asked about product variants (size, color, etc.)",
        price_request: "asked about the price of a product",
      }[intent] || "mentioned a product";

      const prompt = `Generate a brief Instagram DM reply asking a customer which product they're referring to.

Customer's message: "${originalMessage}"
Customer intent: ${intentContext}
${channelContext?.originChannel ? `Conversation origin: ${channelContext.originChannel === "comment" ? "Instagram comment → DM" : "Direct DM"}` : ""}

Requirements:
${customInstruction ? `- CRITICAL STYLE REQUIREMENT: ${customInstruction}. You MUST write in this exact style and tone. This is the most important requirement - match this style precisely.` : `- Style: Use ${tone} tone`}
${customInstruction ? `- Do NOT be friendly, helpful, or enthusiastic unless the custom instruction explicitly says to be. Follow the custom instruction exactly.` : ``}
- Acknowledge their message briefly
- Ask which product they're referring to (they sent a Direct DM without product context)
- Keep it brief (1-2 sentences max)
- Be helpful but concise
- Instagram DMs only support plain text, NOT markdown
- Meta Compliance: If they need further assistance, mention they can contact support (but don't be pushy about it - only mention if natural)

Write the response:`;

      const systemMessage = customInstruction 
        ? `You are an assistant that generates Instagram DM replies. Follow the custom style instruction exactly - it is the most important requirement. Do not default to being friendly or helpful unless the instruction explicitly says so.`
        : `You are a helpful assistant that generates customer service messages for Instagram DMs. Keep responses brief and friendly.`;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      if (response?.choices?.[0]?.message?.content) {
        return response.choices[0].message.content.trim();
      }
    }
  } catch (error) {
    console.error("[automation] Error generating clarifying question:", error);
  }

  // Fallback message if AI generation fails
  const fallbackMessages = {
    friendly: `Hi! Thanks for reaching out! 😊 Which product are you interested in?`,
    expert: `Hello! Could you please specify which product you're referring to?`,
    casual: `Hey! 👋 Which product are you talking about?`,
  };
  
  return fallbackMessages[tone] || fallbackMessages.friendly;
}

/**
 * Check if we can send a follow-up DM (conversation support for Growth/Pro)
 * @param {Object} message - New DM message
 * @param {Object} shop - Shop object
 * @param {Object} plan - Plan object
 * @returns {Promise<boolean>} - True if follow-up is allowed
 */
async function canSendFollowUp(message, shop, plan) {
  // FREE plan: no conversation support
  if (plan.name === "FREE") {
    return false;
  }

  // Growth/Pro: check if last_user_message_at is < 24 hours ago
  if (!message.last_user_message_at) {
    // First message in thread, not a follow-up
    return false;
  }

  const lastMessageTime = new Date(message.last_user_message_at);
  const now = new Date();
  const hoursSinceLastMessage = (now - lastMessageTime) / (1000 * 60 * 60);

  // Allow follow-up if last message was within 24 hours
  return hoursSinceLastMessage < 24;
}

/**
 * Generate reply message with brand voice
 * @param {Object} brandVoice - Brand voice object from brand_voice table
 * @param {string} productName - Product name (optional)
 * @param {string} checkoutUrl - Checkout URL (optional, not needed for store_question)
 * @param {string} intent - Message intent (e.g., "price_request", "purchase", "store_question", etc.)
 * @param {string} productPrice - Product price (optional, required for price_request intent)
 * @param {string} productPageUrl - Product detail page URL (optional, used for product_question intent)
 * @param {string} originalMessage - Original customer message text (optional, used to understand context)
 * @param {Object} storeInfo - Store information object (optional, used for store_question intent)
 * @param {Object} channelContext - Conversation context (optional). Helps the AI understand whether the thread started
 * from a comment vs a DM, and provides light recent-message context for follow-up replies.
 * @param {Object} productContextForReply - Optional { text } from buildProductContextForAI(); when set for product_question/variant_inquiry,
 *   the AI answers using this product context (e.g. "does it come in black?" → answer from actual options).
 * @returns {string} - Generated reply message
 */
export async function generateReplyMessage(brandVoice, productName = null, checkoutUrl, intent = null, productPrice = null, productPageUrl = null, originalMessage = null, storeInfo = null, channelContext = null, productContextForReply = null) {
  const tone = brandVoice?.tone || "friendly";
  const customInstruction = brandVoice?.custom_instruction || "";
  const safeChannelContext = intent === "store_question"
    ? { ...(channelContext || {}), lastProductLink: null }
    : channelContext;

  const sanitizeStoreQuestionReply = (text, allowedUrlsOverride = null) => {
    if (!text) return text;
    const allowedUrls = allowedUrlsOverride ?? [
      storeInfo?.refundPolicy?.url,
      storeInfo?.shippingPolicy?.url,
      storeInfo?.privacyPolicy?.url,
      storeInfo?.termsOfService?.url,
      storeInfo?.storefrontAllProductsUrl,
    ].filter(Boolean);
    const allowedSet = new Set(allowedUrls);
    const urlRegex = /https?:\/\/[^\s)]+/g;
    let removed = false;
    let cleaned = text.replace(urlRegex, (url) => {
      if (allowedSet.has(url)) return url;
      removed = true;
      return "";
    });
    cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
    if (removed && allowedUrls.length === 0) {
      cleaned = cleaned
        ? `${cleaned} I don't have a policy link on hand.`
        : "I don't have a policy link on hand.";
    }
    return cleaned;
  };

  // Base message templates by tone (not used for product_question - AI generates those)
  const toneTemplates = {
    friendly: `Hi! Thanks for your interest! 🛍️\n\n${productName ? `I'd love to help you with ${productName}! ` : ""}Check it out here: ${checkoutUrl}\n\nLet me know if you have any questions!`,
    expert: `Hello! Thank you for your inquiry. ${productName ? `Regarding ${productName}, ` : ""}you can view the product here: ${checkoutUrl}\n\nI'm here to answer any questions you may have.`,
    casual: `Hey! 👋 ${productName ? `Love that you're interested in ${productName}! ` : ""}Here's the link: ${checkoutUrl}\n\nHit me up if you need anything!`,
  };

  let message = toneTemplates[tone] || toneTemplates.friendly;

  // Use AI generation for product_question (needs PDP link), store_question (needs store info), or if custom instruction provided
  // Always use AI for product_question since it needs PDP link, even without custom instruction
  // Always use AI for store_question since it needs store information
  // Also use AI generation if user has brand voice configured (Growth/Pro) to ensure tone is properly applied
  // For Growth/Pro users, even without custom instruction, we want to use AI to properly apply the tone
  const hasBrandVoiceConfig = brandVoice && (customInstruction || (tone && tone !== "friendly"));
  if (intent === "product_question" || intent === "store_question" || customInstruction || hasBrandVoiceConfig || channelContext) {
    try {
      if (openai) {
        // Build one store context for store_question so the AI can answer any question from context
        const storeContextForReply =
          intent === "store_question" && storeInfo
            ? buildStoreContextForAI(storeInfo)
            : null;

        // Use AI to generate a response based on the custom instruction or product_question intent
        let promptBase = `Generate an Instagram DM reply to a customer`;
        let styleInstruction = customInstruction || tone; // Use custom instruction if provided, otherwise use tone
        
        // Include original message for context (especially important for purchase intent)
        if (originalMessage) {
          promptBase += ` who said: "${originalMessage}"`;
        }
        
        if (intent === "price_request") {
          promptBase += ` who asked "How much does this cost?" or similar price question`;
          if (productPrice) {
            promptBase += `. The price is ${productPrice}. Make sure to clearly state the price in your response.`;
          } else {
            promptBase += `. Direct them to the checkout link where they can see the price. Mention that they can see the price when they click the link.`;
          }
        } else if (intent === "product_question") {
          promptBase += ` who asked a question about the product (what it does, how it works, its features, variants, etc.)`;
          promptBase += `. They are asking for information about the product, not necessarily ready to buy yet.`;
          if (productContextForReply?.text) {
            promptBase += ` Use the product context below to answer accurately (e.g. if they ask "does it come in X?" check the available options and say yes or no accordingly).`;
          }
          if (productPageUrl) {
            promptBase += ` You can direct them to the product page (${productPageUrl}) for full details.`;
          }
          if (checkoutUrl) {
            promptBase += ` If they're ready to buy, include the checkout link (${checkoutUrl}).`;
          }
        } else if (intent === "variant_inquiry") {
          promptBase += ` who asked about product variants (size, color, etc.)`;
          promptBase += `. They are interested in specific options.`;
          if (productContextForReply?.text) {
            promptBase += ` Use the product context below to answer accurately. If they ask about an option we don't have (e.g. "do you have black?" and we don't), say so clearly and offer the product or checkout link for what we do have.`;
          }
          if (productPageUrl) {
            promptBase += ` Direct them to the product page (${productPageUrl}) to see all variants.`;
          }
          if (checkoutUrl) {
            promptBase += ` If they're ready to buy, include the checkout link (${checkoutUrl}).`;
          }
        } else if (intent === "purchase") {
          // Don't add duplicate "who said" if we already included originalMessage above
          if (!originalMessage) {
            promptBase += ` who expressed interest in a product`;
          }
          promptBase += `. This could be explicit purchase intent ("I want to buy", "I'll take it") OR enthusiastic interest ("I love this!", "This is amazing!").`;
          if (checkoutUrl) {
            promptBase += ` If they explicitly said they want to buy, direct them to checkout. If they just expressed enthusiasm, acknowledge their excitement first, then offer the checkout link (${checkoutUrl}) as an option if they're interested.`;
          }
        } else if (intent === "store_question") {
          if (!originalMessage) {
            promptBase += ` who asked a general question about the store`;
          }
          promptBase += `. Answer their question using ONLY the store context provided below.`;
        } else {
          if (!originalMessage) {
            promptBase += ` who wants to buy a product or is ready to purchase`;
          }
        }
        
        const recentThreadText = Array.isArray(safeChannelContext?.recentMessages) && safeChannelContext.recentMessages.length > 0
          ? safeChannelContext.recentMessages
              .slice(0, 8)
              .reverse()
              .map((m) => `- ${m.channel === "comment" ? "Comment" : "DM"}: ${m.text || "(no text)"}`)
              .join("\n")
          : null;

        const prompt = `${promptBase}

CRITICAL ACCURACY REQUIREMENTS:
- NEVER make up, invent, or fabricate ANY information
- NEVER create fake email addresses, URLs, contact information, product details, prices, or policy information
- ONLY use information that is explicitly provided above
- If information is not provided, say "I don't have that information" or direct them to check the provided links
- If you don't know something, admit it - do NOT guess or assume
- Accuracy is more important than being helpful

IMPORTANT CONTEXT:
${safeChannelContext?.originChannel ? `- Conversation origin: ${safeChannelContext.originChannel === "comment" ? "Instagram comment → DM (has product context from a post mapping)" : "Direct DM (may not have product context unless explicitly provided)"}` : ""}
${safeChannelContext?.inboundChannel ? `- Current inbound channel: ${safeChannelContext.inboundChannel === "comment" ? "Instagram comment" : "Instagram DM"}` : ""}
${safeChannelContext?.lastProductLink?.url ? `- Most recent product link previously sent in this thread: ${safeChannelContext.lastProductLink.url}` : ""}
${safeChannelContext?.isHomepageFallback && checkoutUrl ? `- No product is mapped to this post. Direct the customer to the store HOMEPAGE so they can browse. Use this URL exactly (it is the homepage, not a checkout link): ${checkoutUrl}. Do not invent or shorten the URL.` : ""}
${recentThreadText ? `- Recent thread messages (most recent last):\n${recentThreadText}` : ""}
${intent === "purchase" && originalMessage ? `The customer's original message was: "${originalMessage}". Analyze this message carefully:
- If they explicitly said they want to buy (e.g., "I want to buy", "I'll take it", "How do I purchase?", "I'm ready to buy"), then direct them to checkout.
- If they just expressed enthusiasm/interest (e.g., "I love this!", "This is amazing!", "So cool!", "Love this product!"), then acknowledge their excitement first, then offer the checkout link as an option if they're interested in purchasing. Don't assume they're ready to buy immediately.` : ""}
${intent === "purchase" && !originalMessage ? `The customer expressed interest in a product. This could be explicit purchase intent OR enthusiastic interest. Read the context carefully and respond appropriately.` : ""}
${intent === "price_request" ? `The customer specifically asked about the price. You MUST acknowledge their price question and answer it directly.` : ""}
${intent === "price_request" && productPrice ? `The exact price is ${productPrice} - you MUST state this price clearly in your response.` : ""}
${intent === "price_request" && !productPrice ? `You don't have the exact price, but you MUST acknowledge their price question. Tell them they can see the price when they click the checkout link.` : ""}
${intent === "product_question" ? `The customer asked a question about a product. You should acknowledge their question and direct them to the product page (PDP) where they can find all product details. DO NOT pretend to know the answer if you don't have product information.` : ""}
${intent === "variant_inquiry" ? `The customer asked about variants (size, color, etc.). Direct them to the product page (PDP) where they can see all available options.` : ""}
${intent === "store_question" ? `Answer the customer's question using ONLY the store context below. Use exact numbers, URLs, and contact details from the context. If the answer is not in the context, say so. Never invent, shorten, or make up URLs (no is.gd, bit.ly, or placeholders).` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productContextForReply?.text ? `CRITICAL: Answer using ONLY the product context below. If the product context says "only one variant" or "does NOT come in different sizes or colors", you MUST answer NO to the customer (e.g. "No, it only comes in one option" or "We don't have other colors"). If they ask about a variant we don't have, say NO clearly and include the product page and checkout URLs from this prompt - copy those exact URLs into your reply.` : ""}
${storeContextForReply?.text ? `\n--- STORE CONTEXT (use only this information) ---\n${storeContextForReply.text}\n--- END STORE CONTEXT ---` : ""}
${productContextForReply?.text ? `\n--- PRODUCT CONTEXT (use only this for product/variant questions) ---\n${productContextForReply.text}\n--- END PRODUCT CONTEXT ---` : ""}

Requirements:
${customInstruction ? `- CRITICAL STYLE REQUIREMENT: ${customInstruction}. You MUST write in this exact style and tone. This is the most important requirement - match this style precisely.` : `- Style: Use ${tone} tone`}
${customInstruction ? `- Do NOT be friendly, helpful, or enthusiastic unless the custom instruction explicitly says to be. Follow the custom instruction exactly.` : ``}
${intent === "purchase" ? `- CRITICAL: Read the original message carefully. If they explicitly said they want to buy (e.g., "I want to buy", "I'll take it"), direct them to checkout. If they just expressed enthusiasm/interest (e.g., "I love this!", "This is amazing!"), acknowledge their excitement first, then offer the checkout link as an option if they're interested in purchasing.` : ""}
${intent === "price_request" ? `- CRITICAL: Start your response by acknowledging their price question (e.g., "Yeah!" or "It's..." or "You can see it's...")` : ""}
${intent === "product_question" && productPageUrl ? `- CRITICAL: Acknowledge their product question` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productPageUrl ? `- CRITICAL: Acknowledge their question and direct them to the product page (${productPageUrl}) where they can see all details/variants` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productPageUrl && checkoutUrl ? `- Then, if they're ready to buy, you can optionally mention the checkout link (${checkoutUrl}) at the end` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && !productPageUrl ? `- CRITICAL: Acknowledge their question and direct them to the checkout link for full details` : ""}
${intent === "store_question" ? `- Answer from the store context only. Use only URLs, numbers, and contact info that appear in the store context. If something is not there, say so. No invented or shortened URLs.` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productContextForReply?.text ? `- Answer from the product context only. If they ask about an option (e.g. color/size) we don't have, say so and offer the product or checkout link for available options.` : ""}
${intent !== "product_question" && intent !== "variant_inquiry" && intent !== "store_question" && checkoutUrl && !safeChannelContext?.isHomepageFallback ? `- Include this checkout link: ${checkoutUrl}` : ""}
${safeChannelContext?.isHomepageFallback && checkoutUrl ? `- Include the store homepage link so they can browse (use this URL exactly): ${checkoutUrl}` : ""}
${productName ? `- Product name: ${productName}` : ""}
- Keep it brief (2-3 sentences max)${customInstruction ? `` : ` and friendly`}
- CRITICAL: Instagram DMs only support plain text, NOT markdown. Do NOT use markdown formatting like [link text](url). Instead, write clear descriptive text before the URL, then include the full URL directly. ${intent === "store_question" ? `Only use URLs from the store context above.` : `URLs will be automatically shortened for cleaner appearance.`} Instagram will automatically make URLs clickable. For example, write "Check it out here: https://example.com/product" NOT "[Check it out here](https://example.com/product)". Make the text before the URL descriptive so users know what they're clicking.
${intent === "price_request" ? "- The checkout link shows the price - mention this if you don't have the exact price" : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productPageUrl ? "- Structure: Acknowledge question → Direct to product page link for details/variants → Optionally mention checkout link at the end if ready to buy" : ""}
${(intent === "product_question" || intent === "variant_inquiry") && !productPageUrl ? "- CRITICAL: Don't make up details you don't know - just acknowledge their question and direct them to the link for full details. If you don't know the answer, say so." : ""}
${intent === "price_request" && !productPrice ? "- CRITICAL: If you don't have the exact price, direct them to the checkout link to see the price. Do NOT guess or estimate the price." : ""}
${customInstruction ? `` : `- End with an offer to help with questions`}

Write the response:`;

        const systemMessage = customInstruction 
          ? `You are an assistant that generates Instagram DM replies. CRITICAL RULES:
1. NEVER make up, invent, or fabricate any information (email addresses, URLs, contact info, product details, prices, policies, etc.)
2. ONLY use information explicitly provided in the user's message or context
3. If information is not provided, say "I don't have that information" or direct them to check the provided links
4. Follow the custom style instruction exactly - it is the most important requirement after accuracy
5. Do not default to being friendly or helpful unless the instruction explicitly says so.`
          : `You are an assistant that generates customer service messages for Instagram DMs. CRITICAL RULES:
1. NEVER make up, invent, or fabricate any information (email addresses, URLs, contact info, product details, prices, policies, etc.)
2. ONLY use information explicitly provided in the user's message or context
3. If information is not provided, say "I don't have that information" or direct them to check the provided links
4. Keep responses brief and friendly
5. Accuracy is more important than being helpful - never guess or assume`;
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: prompt }
          ],
          temperature: 0.3, // Lower temperature to reduce creativity/hallucination - prioritize accuracy over creativity
          max_tokens: 250, // Increased from 150 to allow for complete responses with links
        });

        if (response?.choices?.[0]?.message?.content) {
          message = response.choices[0].message.content.trim();
          if (intent === "store_question") {
            message = sanitizeStoreQuestionReply(message, storeContextForReply?.allowedUrls);
          }
          if ((intent === "product_question" || intent === "variant_inquiry") && (productPageUrl || checkoutUrl)) {
            const allowedProductUrls = [productPageUrl, checkoutUrl].filter(Boolean);
            const urlRegex = /https?:\/\/[^\s)]+/g;
            message = message.replace(urlRegex, (matched) => {
              const normalized = matched.replace(/[.,;:!?)\]\s]+$/g, "").trim();
              const allowed = allowedProductUrls.find((a) => normalized === a || normalized.startsWith(a + "/") || normalized.startsWith(a + "?"));
              return allowed != null ? allowed : "";
            });
            message = message.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
          }
          if (safeChannelContext?.isHomepageFallback && checkoutUrl) {
            const urlRegex = /https?:\/\/[^\s)]+/g;
            message = message.replace(urlRegex, (matched) => {
              const normalized = matched.replace(/[.,;:!?)\]\s]+$/g, "").trim();
              return normalized === checkoutUrl || normalized.startsWith(checkoutUrl + "/") || normalized.startsWith(checkoutUrl + "?") ? checkoutUrl : "";
            });
            message = message.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
          }
        }
      }
    } catch (error) {
      console.error("[automation] Error generating AI response with custom instruction:", error);
      // Fallback to prepending if AI generation fails
    message = `${customInstruction}\n\n${message}`;
    }
  }

  return message;
}

