/**
 * Automation Functions for DM-to-Buy
 * Handles checkout link generation, DM sending, and message processing
 */

import { randomUUID } from "crypto";
import { getShopPlanAndUsage, incrementUsage } from "./db.server";
import { logLinkSent } from "./db.server";
import { getMetaAuthWithRefresh, metaGraphAPI } from "./meta.server";
import { getProductMappings } from "./db.server";
import { getSettings, getBrandVoice } from "./db.server";

/**
 * Generate a unique link_id (UUID format, stored as TEXT)
 */
function generateLinkId() {
  return randomUUID();
}

/**
 * Build a Shopify checkout/cart link with UTMs and link_id
 * @param {Object} shop - Shop object with shopify_domain
 * @param {string} productId - Shopify product ID (gid format)
 * @param {string|null} variantId - Shopify variant ID (gid format, optional)
 * @param {number} qty - Quantity (default: 1)
 * @returns {Promise<{url: string, linkId: string}>} - Checkout URL and link ID
 */
export async function buildCheckoutLink(shop, productId, variantId = null, qty = 1) {
  if (!shop || !shop.shopify_domain) {
    throw new Error("Shop domain is required");
  }

  if (!productId) {
    throw new Error("Product ID is required");
  }

  // Generate unique link_id
  const linkId = generateLinkId();

  // Extract product handle from product ID (gid://shopify/Product/123456789)
  // For now, we'll use a cart URL format that works with product/variant IDs
  // Format: https://{shop}.myshopify.com/cart/{variant_id}:{qty}
  // Or: https://{shop}.myshopify.com/products/{handle}?variant={variant_id}&quantity={qty}
  
  // Since we have product/variant IDs in GID format, we need to extract the numeric ID
  const productIdMatch = productId.match(/\/(\d+)$/);
  const variantIdMatch = variantId ? variantId.match(/\/(\d+)$/) : null;

  if (!productIdMatch) {
    throw new Error("Invalid product ID format");
  }

  const productNumericId = productIdMatch[1];
  const variantNumericId = variantIdMatch ? variantIdMatch[1] : null;

  // Build the checkout URL
  // Using cart URL format: /cart/{variant_id}:{qty} or /cart/add?id={variant_id}&quantity={qty}
  let checkoutUrl;
  if (variantNumericId) {
    // Use variant-specific cart URL
    checkoutUrl = `https://${shop.shopify_domain}/cart/${variantNumericId}:${qty}`;
  } else {
    // Use product cart URL (will use default variant)
    checkoutUrl = `https://${shop.shopify_domain}/cart/add?id=${productNumericId}&quantity=${qty}`;
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

  // Get Meta auth with automatic token refresh
  const metaAuth = await getMetaAuthWithRefresh(shopId);
  if (!metaAuth || !metaAuth.ig_business_id) {
    throw new Error("Instagram not connected for this shop");
  }

  // Use IG token if available, otherwise fall back to page token
  const accessToken = metaAuth.ig_access_token || metaAuth.page_access_token;
  if (!accessToken) {
    throw new Error("No Instagram access token available");
  }

  // Rate limiting: max 10 messages per minute per shop
  // TODO: Implement proper rate limiting (in-memory or Redis)
  // For now, we'll rely on Meta's API rate limits

  // Send DM via Instagram Messaging API
  // Endpoint: POST /{ig-user-id}/messages
  const endpoint = `/${metaAuth.ig_business_id}/messages`;
  
  const messageData = {
    recipient: {
      id: igUserId,
    },
    message: {
      text: text,
    },
  };

  try {
    const response = await metaGraphAPI(endpoint, accessToken, {
      method: "POST",
      body: messageData,
    });

    console.log(`[automation] DM sent successfully to ${igUserId}`);
    return response;
  } catch (error) {
    console.error(`[automation] Error sending DM:`, error);
    
    // Handle specific error cases
    if (error.message?.includes("rate limit")) {
      throw new Error("Rate limit exceeded. Please try again later.");
    } else if (error.message?.includes("invalid token")) {
      throw new Error("Instagram token expired. Please reconnect your account.");
    } else if (error.message?.includes("user blocked")) {
      throw new Error("User has blocked this account.");
    }
    
    throw error;
  }
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
    // 1. Check publish mode: if dm_automation_enabled = false, skip automation
    const settings = await getSettings(shop.id);
    if (settings?.dm_automation_enabled === false) {
      console.log(`[automation] DM automation disabled for shop ${shop.id}`);
      return { sent: false, reason: "DM automation disabled" };
    }


    // 2. If shop plan is FREE, check usage_count < cap (25)
    if (plan.name === "FREE") {
      const usageData = await getShopPlanAndUsage(shop.id);
      if (usageData.usage >= plan.cap) {
        console.log(`[automation] Usage cap exceeded for FREE shop ${shop.id}: ${usageData.usage}/${plan.cap}`);
        return { sent: false, reason: "Usage cap exceeded" };
      }
    }

    // 3. Check if this is a follow-up (conversation support for Growth/Pro)
    const isFollowUp = await canSendFollowUp(message, shop, plan);
    
    // For FREE plan, only allow first reply (no follow-ups)
    if (plan.name === "FREE" && isFollowUp) {
      console.log(`[automation] Follow-up DMs not available on FREE plan`);
      return { sent: false, reason: "Follow-up DMs not available on FREE plan" };
    }

    // 4. Check AI intent: if not purchase/product_question, skip automation
    // For follow-ups, we can be more lenient
    if (!isFollowUp && (!message.ai_intent || !["purchase", "product_question"].includes(message.ai_intent))) {
      console.log(`[automation] AI intent "${message.ai_intent}" not eligible for automation`);
      return { sent: false, reason: `AI intent "${message.ai_intent}" not eligible` };
    }

    // 4. Resolve the product using post_product_map or fallback
    // For now, we'll try to find a product mapping
    // TODO: Add fallback keyword search if no mapping found
    const productMappings = await getProductMappings(shop.id);
    
    // Try to find product mapping (for now, just use first available mapping)
    // In a real scenario, you'd match based on the media ID from the DM context
    let productMapping = null;
    if (productMappings && productMappings.length > 0) {
      // For now, use the first mapping
      // TODO: Match based on media context from DM
      productMapping = productMappings[0];
    }

    if (!productMapping) {
      console.log(`[automation] No product mapping found for shop ${shop.id}`);
      return { sent: false, reason: "No product mapping found" };
    }

    // 5. Generate checkout link
    const { url: checkoutUrl, linkId } = await buildCheckoutLink(
      shop,
      productMapping.product_id,
      productMapping.variant_id,
      1
    );

    // 6. Get brand voice and generate reply message
    const brandVoiceData = await getBrandVoice(shop.id);
    const productName = null; // TODO: Get product name from Shopify
    const replyText = generateReplyMessage(brandVoiceData, productName, checkoutUrl);

    // 7. Send DM reply
    await sendDmReply(shop.id, message.from_user_id, replyText);

    // 8. Increment usage count
    await incrementUsage(shop.id, 1);

    // 9. Log the sent link
    await logLinkSent({
      shopId: shop.id,
      messageId: message.id,
      productId: productMapping.product_id,
      variantId: productMapping.variant_id,
      url: checkoutUrl,
      linkId: linkId,
      replyText: replyText,
    });

    console.log(`[automation] ✅ Automated DM sent successfully for message ${message.id}`);
    return { sent: true };
  } catch (error) {
    console.error(`[automation] Error processing DM ${message.id}:`, error);
    return { sent: false, reason: error.message || "Unknown error" };
  }
}

/**
 * Check if a comment has already received an automated DM reply
 * @param {string} commentId - Instagram comment ID
 * @param {string} shopId - Shop UUID
 * @returns {Promise<boolean>} - True if already replied
 */
async function hasCommentBeenReplied(commentId, shopId) {
  // Check if we've sent a link for this comment
  // We can track this by checking if there's a link_sent record with the comment's external_id
  const { data } = await supabase
    .from("links_sent")
    .select("id")
    .eq("shop_id", shopId)
    .eq("message_id", commentId)
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


    // 3. Check AI intent and confidence threshold (0.7)
    if (!message.ai_intent || !["purchase", "product_question"].includes(message.ai_intent)) {
      console.log(`[automation] Comment AI intent "${message.ai_intent}" not eligible`);
      return { sent: false, reason: `AI intent "${message.ai_intent}" not eligible` };
    }

    if (!message.ai_confidence || message.ai_confidence < 0.7) {
      console.log(`[automation] Comment confidence ${message.ai_confidence} below threshold (0.7)`);
      return { sent: false, reason: `Confidence ${message.ai_confidence} below threshold` };
    }

    // 4. Check if we've already replied to this comment (7-day window check)
    const commentAge = new Date() - new Date(message.created_at);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (commentAge > sevenDaysMs) {
      console.log(`[automation] Comment is older than 7 days, cannot reply`);
      return { sent: false, reason: "Comment older than 7 days" };
    }

    const alreadyReplied = await hasCommentBeenReplied(message.external_id, shop.id);
    if (alreadyReplied) {
      console.log(`[automation] Already replied to comment ${message.external_id}`);
      return { sent: false, reason: "Already replied to this comment" };
    }

    // 5. Find product mapping for this media
    const productMappings = await getProductMappings(shop.id);
    const productMapping = productMappings.find((m) => m.ig_media_id === mediaId);

    if (!productMapping) {
      console.log(`[automation] No product mapping found for media ${mediaId}`);
      return { sent: false, reason: "No product mapping found for this post" };
    }

    // 6. Generate checkout link
    const { url: checkoutUrl, linkId } = await buildCheckoutLink(
      shop,
      productMapping.product_id,
      productMapping.variant_id,
      1
    );

    // 7. Generate reply message (private DM)
    const replyText = `Hi! Thanks for your comment! 🛍️\n\nI saw you're interested in this product. Check it out here: ${checkoutUrl}\n\nLet me know if you have any questions!`;

    // 8. Send private DM reply
    await sendDmReply(shop.id, message.from_user_id, replyText);

    // 9. Increment usage count
    await incrementUsage(shop.id, 1);

    // 10. Log the sent link (this also tracks that we replied to the comment)
    await logLinkSent({
      shopId: shop.id,
      messageId: message.id, // Link this to the comment message
      productId: productMapping.product_id,
      variantId: productMapping.variant_id,
      url: checkoutUrl,
      linkId: linkId,
      replyText: replyText,
    });

    console.log(`[automation] ✅ Comment-to-DM sent successfully for comment ${message.id}`);
    return { sent: true };
  } catch (error) {
    console.error(`[automation] Error processing comment ${message.id}:`, error);
    return { sent: false, reason: error.message || "Unknown error" };
  }
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
 * @param {string} checkoutUrl - Checkout URL
 * @returns {string} - Generated reply message
 */
function generateReplyMessage(brandVoice, productName = null, checkoutUrl) {
  const tone = brandVoice?.tone || "friendly";
  const customInstruction = brandVoice?.custom_instruction || "";

  // Base message templates by tone
  const toneTemplates = {
    friendly: `Hi! Thanks for your interest! 🛍️\n\n${productName ? `I'd love to help you with ${productName}! ` : ""}Check it out here: ${checkoutUrl}\n\nLet me know if you have any questions!`,
    expert: `Hello! Thank you for your inquiry. ${productName ? `Regarding ${productName}, ` : ""}you can view the product here: ${checkoutUrl}\n\nI'm here to answer any questions you may have.`,
    casual: `Hey! 👋 ${productName ? `Love that you're interested in ${productName}! ` : ""}Here's the link: ${checkoutUrl}\n\nHit me up if you need anything!`,
  };

  let message = toneTemplates[tone] || toneTemplates.friendly;

  // Apply custom instruction if provided
  if (customInstruction) {
    // For now, prepend custom instruction as context
    // In a full implementation, you'd use this in an AI prompt to generate the message
    message = `${customInstruction}\n\n${message}`;
  }

  return message;
}

