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
 * Shorten a URL using a free URL shortener service
 * @param {string} longUrl - The URL to shorten
 * @returns {Promise<string>} - The shortened URL, or original URL if shortening fails
 */
async function shortenUrl(longUrl) {
  try {
    // Use is.gd API (free, no API key required)
    const response = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`);
    const data = await response.json();
    
    if (data.shorturl) {
      return data.shorturl;
    }
  } catch (error) {
    console.warn(`[automation] Failed to shorten URL: ${error.message}`);
  }
  
  // Fallback: try TinyURL as backup
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
    const shortUrl = await response.text();
    
    if (shortUrl && shortUrl.startsWith('http')) {
      return shortUrl.trim();
    }
  } catch (error) {
    console.warn(`[automation] Failed to shorten URL with TinyURL: ${error.message}`);
  }
  
  // If all shortening fails, return original URL
  return longUrl;
}

/**
 * Build a Shopify product detail page (PDP) link
 * @param {Object} shop - Shop object with shopify_domain
 * @param {string} productId - Shopify product ID (gid format)
 * @param {string|null} variantId - Shopify variant ID (gid format, optional)
 * @param {string|null} productHandle - Product handle (optional, preferred)
 * @param {boolean} shorten - Whether to shorten the URL (default: true)
 * @returns {Promise<string>} - Product detail page URL (shortened if shorten=true)
 */
export async function buildProductPageLink(shop, productId, variantId = null, productHandle = null, shorten = true) {
  if (!shop || !shop.shopify_domain) {
    throw new Error("Shop domain is required");
  }

  if (!productId) {
    throw new Error("Product ID is required");
  }

  // Extract numeric ID from GID format
  const productIdMatch = productId.match(/\/(\d+)$/);
  const variantIdMatch = variantId ? variantId.match(/\/(\d+)$/) : null;
  const productNumericId = productIdMatch ? productIdMatch[1] : null;

  if (!productNumericId) {
    throw new Error("Invalid product ID format");
  }

  // Build PDP URL - prefer handle if available, otherwise use numeric ID
  let pdpUrl;
  if (productHandle) {
    pdpUrl = `https://${shop.shopify_domain}/products/${productHandle}`;
  } else {
    // Fallback to numeric ID (may not work for all stores, but better than nothing)
    pdpUrl = `https://${shop.shopify_domain}/products/${productNumericId}`;
  }

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
  
  // Shorten URL if requested
  if (shorten) {
    return await shortenUrl(finalUrl);
  }
  
  return finalUrl;
}

/**
 * Build a Shopify checkout/cart link with UTMs and link_id
 * @param {Object} shop - Shop object with shopify_domain
 * @param {string} productId - Shopify product ID (gid format)
 * @param {string|null} variantId - Shopify variant ID (gid format, optional)
 * @param {number} qty - Quantity (default: 1)
 * @param {boolean} shorten - Whether to shorten the URL (default: true)
 * @returns {Promise<{url: string, linkId: string}>} - Checkout URL and link ID
 */
export async function buildCheckoutLink(shop, productId, variantId = null, qty = 1, shorten = true) {
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

  let finalUrl = `${checkoutUrl}?${params.toString()}`;
  
  // Shorten URL if requested
  if (shorten) {
    finalUrl = await shortenUrl(finalUrl);
  }

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
    
    // Handle expired token error (Code: 190, error_subcode: 463) - retry with refreshed token
    if (error.message?.includes("Code: 190") || error.message?.includes("Session has expired")) {
      console.log(`[automation] Token expired, refreshing and retrying...`);
      try {
        // Refresh token and retry
        const { refreshMetaToken } = await import("./meta.server");
        await refreshMetaToken(shopId);
        
        // Get fresh auth after refresh
        const freshAuth = await getMetaAuthWithRefresh(shopId);
        const freshToken = freshAuth.ig_access_token || freshAuth.page_access_token;
        
        if (!freshToken) {
          throw new Error("No Instagram access token available after refresh");
        }
        
        // Retry the API call with fresh token
        const retryResponse = await metaGraphAPI(endpoint, freshToken, {
          method: "POST",
          body: messageData,
        });
        
        console.log(`[automation] DM sent successfully to ${igUserId} after token refresh`);
        return retryResponse;
      } catch (refreshError) {
        console.error(`[automation] Token refresh failed:`, refreshError);
        throw new Error("Instagram token expired and refresh failed. Please reconnect your account.");
      }
    }
    
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

    // 4. Check AI intent: eligible intents include product-specific and store-general questions
    // For follow-ups, we can be more lenient
    // Note: price_request indicates purchase intent, so we should respond with checkout link
    const productSpecificIntents = ["purchase", "product_question", "variant_inquiry", "price_request"];
    const generalIntents = ["store_question"];
    const eligibleIntents = [...productSpecificIntents, ...generalIntents];
    
    if (!isFollowUp && (!message.ai_intent || !eligibleIntents.includes(message.ai_intent))) {
      console.log(`[automation] AI intent "${message.ai_intent}" not eligible for automation`);
      return { sent: false, reason: `AI intent "${message.ai_intent}" not eligible` };
    }

    // 5. Handle store_question (general store questions) - doesn't need product mapping
    if (message.ai_intent === "store_question") {
      // Get brand voice and generate reply message for store questions
      const brandVoiceData = await getBrandVoice(shop.id);
      
      // For store questions, the AI can answer based on the question content
      // Store-specific data fetching would require request context, which we don't have in webhooks
      // The AI will still be able to provide helpful general answers
      const replyText = await generateReplyMessage(
        brandVoiceData,
        null,
        null,
        message.ai_intent,
        null,
        null,
        message.text,
        null // storeInfo - can be enhanced later to fetch from Shopify API
      );

      // Send DM reply
      await sendDmReply(shop.id, message.from_user_id, replyText);

      // Increment usage count
      await incrementUsage(shop.id, 1);

      console.log(`[automation] ✅ Automated DM sent for store question ${message.id}`);
      return { sent: true };
    }

    // 6. For product-specific intents, resolve the product using post_product_map or search
    const productMappings = await getProductMappings(shop.id);
    
    // Try to find product mapping (for now, just use first available mapping)
    // In a real scenario, you'd match based on the media ID from the DM context
    // For product_question, we can also try to search for products mentioned in the message
    let productMapping = null;
    if (productMappings && productMappings.length > 0) {
      // For now, use the first mapping
      // TODO: Match based on media context from DM or search for product name in message
      productMapping = productMappings[0];
    }

    // If no product mapping found but it's a product_question, try searching for products
    if (!productMapping && message.ai_intent === "product_question" && message.text) {
      // TODO: Search for products mentioned in the message text
      // This would require passing the request object to search Shopify products
      console.log(`[automation] No product mapping found, but product_question intent - would search products if request context available`);
    }

    if (!productMapping && productSpecificIntents.includes(message.ai_intent)) {
      console.log(`[automation] No product mapping found for shop ${shop.id}`);
      return { sent: false, reason: "No product mapping found" };
    }

    // 5. Generate links - use PDP link for product_question and variant_inquiry, checkout link for others
    let productPageUrl = null;
    let checkoutUrl = null;
    let linkId = null;
    
    if (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry") {
      // For product questions and variant inquiries, use PDP link first (they need to see product details/variants)
      productPageUrl = await buildProductPageLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        productMapping.product_handle || null // TODO: Store product handle in mapping
      );
      // Also generate checkout link for after they see product details
      const checkoutLink = await buildCheckoutLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        1
      );
      checkoutUrl = checkoutLink.url;
      linkId = checkoutLink.linkId;
    } else {
      // For purchase intent, price requests - use checkout link
      const checkoutLink = await buildCheckoutLink(
      shop,
      productMapping.product_id,
      productMapping.variant_id,
      1
    );
      checkoutUrl = checkoutLink.url;
      linkId = checkoutLink.linkId;
    }

    // 6. Get brand voice and generate reply message
    const brandVoiceData = await getBrandVoice(shop.id);
    const productName = null; // TODO: Get product name from Shopify
    const productPrice = null; // TODO: Get product price from Shopify
    // Pass the intent, links, and original message so the AI can understand context
    const replyText = await generateReplyMessage(brandVoiceData, productName, checkoutUrl, message.ai_intent, productPrice, productPageUrl, message.text);

    // 7. Send DM reply
    await sendDmReply(shop.id, message.from_user_id, replyText);

    // 8. Increment usage count
    await incrementUsage(shop.id, 1);

    // 9. Log the sent link (use checkout URL for tracking, or PDP URL if product_question)
    await logLinkSent({
      shopId: shop.id,
      messageId: message.id,
      productId: productMapping.product_id,
      variantId: productMapping.variant_id,
      url: message.ai_intent === "product_question" && productPageUrl ? productPageUrl : checkoutUrl,
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

    // 6. Generate links - use PDP link for product_question and variant_inquiry, checkout link for others
    let productPageUrl = null;
    let checkoutUrl = null;
    let linkId = null;
    
    if (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry") {
      // For product questions and variant inquiries, use PDP link first (they need to see product details/variants)
      productPageUrl = await buildProductPageLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        productMapping.product_handle || null // TODO: Store product handle in mapping
      );
      // Also generate checkout link for after they see product details
      const checkoutLink = await buildCheckoutLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        1
      );
      checkoutUrl = checkoutLink.url;
      linkId = checkoutLink.linkId;
    } else {
      // For purchase intent, price requests - use checkout link
      const checkoutLink = await buildCheckoutLink(
        shop,
        productMapping.product_id,
        productMapping.variant_id,
        1
      );
      checkoutUrl = checkoutLink.url;
      linkId = checkoutLink.linkId;
    }

    // 7. Get brand voice and generate reply message (private DM)
    const brandVoiceData = await getBrandVoice(shop.id);
    const productName = null; // TODO: Get product name from Shopify
    const productPrice = null; // TODO: Get product price from Shopify
    // Pass the intent, links, and original message so the AI can understand context
    const replyText = await generateReplyMessage(brandVoiceData, productName, checkoutUrl, message.ai_intent, productPrice, productPageUrl, message.text);

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
      url: (message.ai_intent === "product_question" || message.ai_intent === "variant_inquiry") && productPageUrl ? productPageUrl : checkoutUrl,
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
 * @param {string} checkoutUrl - Checkout URL (optional, not needed for store_question)
 * @param {string} intent - Message intent (e.g., "price_request", "purchase", "store_question", etc.)
 * @param {string} productPrice - Product price (optional, required for price_request intent)
 * @param {string} productPageUrl - Product detail page URL (optional, used for product_question intent)
 * @param {string} originalMessage - Original customer message text (optional, used to understand context)
 * @param {Object} storeInfo - Store information object (optional, used for store_question intent)
 * @returns {string} - Generated reply message
 */
export async function generateReplyMessage(brandVoice, productName = null, checkoutUrl, intent = null, productPrice = null, productPageUrl = null, originalMessage = null, storeInfo = null) {
  const tone = brandVoice?.tone || "friendly";
  const customInstruction = brandVoice?.custom_instruction || "";

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
  if (intent === "product_question" || intent === "store_question" || customInstruction || hasBrandVoiceConfig) {
    try {
      // Import OpenAI client from ai.server.js
      const openaiModule = await import("../lib/ai.server.js");
      // The openai client is not exported as default, we need to access it differently
      // Let's create a simple AI generation function inline
      const OpenAI = (await import("openai")).default;
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      
      if (OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        
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
          promptBase += ` who asked a question about the product (what it does, how it works, its features, etc.)`;
          promptBase += `. They are asking for information about the product, not necessarily ready to buy yet.`;
          if (productPageUrl) {
            promptBase += ` Direct them to the product page (${productPageUrl}) where they can find all product details.`;
          }
          if (checkoutUrl) {
            promptBase += ` If they're ready to buy after seeing the product details, you can also include the checkout link (${checkoutUrl}).`;
          }
        } else if (intent === "variant_inquiry") {
          promptBase += ` who asked about product variants (size, color, etc.)`;
          promptBase += `. They are interested in specific options.`;
          if (productPageUrl) {
            promptBase += ` Direct them to the product page (${productPageUrl}) where they can see all available variants.`;
          }
          if (checkoutUrl) {
            promptBase += ` If they're ready to buy after seeing the variants, you can also include the checkout link (${checkoutUrl}).`;
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
          // Don't add duplicate "who said" if we already included originalMessage above
          if (!originalMessage) {
            promptBase += ` who asked a general question about the store`;
          }
          promptBase += `. They are asking about store policies, information, sales, shipping, returns, etc. - NOT about a specific product.`;
          if (storeInfo) {
            promptBase += ` Use the following store information to answer their question:`;
            if (storeInfo.refundPolicy) {
              promptBase += ` Return Policy: ${storeInfo.refundPolicy.title} - ${storeInfo.refundPolicy.body?.substring(0, 500) || 'See policy page'}`;
            }
            if (storeInfo.shippingPolicy) {
              promptBase += ` Shipping Policy: ${storeInfo.shippingPolicy.title} - ${storeInfo.shippingPolicy.body?.substring(0, 500) || 'See policy page'}`;
            }
            if (storeInfo.name) {
              promptBase += ` Store Name: ${storeInfo.name}`;
            }
            if (storeInfo.description) {
              promptBase += ` Store Description: ${storeInfo.description.substring(0, 300)}`;
            }
          }
        } else {
          if (!originalMessage) {
            promptBase += ` who wants to buy a product or is ready to purchase`;
          }
        }
        
        const prompt = `${promptBase}

IMPORTANT CONTEXT:
${intent === "purchase" && originalMessage ? `The customer's original message was: "${originalMessage}". Analyze this message carefully:
- If they explicitly said they want to buy (e.g., "I want to buy", "I'll take it", "How do I purchase?", "I'm ready to buy"), then direct them to checkout.
- If they just expressed enthusiasm/interest (e.g., "I love this!", "This is amazing!", "So cool!", "Love this product!"), then acknowledge their excitement first, then offer the checkout link as an option if they're interested in purchasing. Don't assume they're ready to buy immediately.` : ""}
${intent === "purchase" && !originalMessage ? `The customer expressed interest in a product. This could be explicit purchase intent OR enthusiastic interest. Read the context carefully and respond appropriately.` : ""}
${intent === "price_request" ? `The customer specifically asked about the price. You MUST acknowledge their price question and answer it directly.` : ""}
${intent === "price_request" && productPrice ? `The exact price is ${productPrice} - you MUST state this price clearly in your response.` : ""}
${intent === "price_request" && !productPrice ? `You don't have the exact price, but you MUST acknowledge their price question. Tell them they can see the price when they click the checkout link.` : ""}
${intent === "product_question" ? `The customer asked a question about a product. You should acknowledge their question and direct them to the product page (PDP) where they can find all product details. DO NOT pretend to know the answer if you don't have product information.` : ""}
${intent === "variant_inquiry" ? `The customer asked about variants (size, color, etc.). Direct them to the product page (PDP) where they can see all available options.` : ""}
${intent === "store_question" ? `The customer asked a general question about the store (policies, shipping, returns, sales, etc.). Answer their question using the store information provided. If you don't have the specific information, be honest and direct them to the store website or contact information.` : ""}
${intent === "store_question" && storeInfo ? `Store Information Available: ${JSON.stringify(storeInfo, null, 2)}` : ""}

Requirements:
${customInstruction ? `- CRITICAL STYLE REQUIREMENT: ${customInstruction}. You MUST write in this exact style and tone. This is the most important requirement - match this style precisely.` : `- Style: Use ${tone} tone`}
${customInstruction ? `- Do NOT be friendly, helpful, or enthusiastic unless the custom instruction explicitly says to be. Follow the custom instruction exactly.` : ``}
${intent === "purchase" ? `- CRITICAL: Read the original message carefully. If they explicitly said they want to buy (e.g., "I want to buy", "I'll take it"), direct them to checkout. If they just expressed enthusiasm/interest (e.g., "I love this!", "This is amazing!"), acknowledge their excitement first, then offer the checkout link as an option if they're interested in purchasing.` : ""}
${intent === "price_request" ? `- CRITICAL: Start your response by acknowledging their price question (e.g., "Yeah!" or "It's..." or "You can see it's...")` : ""}
${intent === "product_question" && productPageUrl ? `- CRITICAL: Acknowledge their product question` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productPageUrl ? `- CRITICAL: Acknowledge their question and direct them to the product page (${productPageUrl}) where they can see all details/variants` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productPageUrl && checkoutUrl ? `- Then, if they're ready to buy, you can optionally mention the checkout link (${checkoutUrl}) at the end` : ""}
${(intent === "product_question" || intent === "variant_inquiry") && !productPageUrl ? `- CRITICAL: Acknowledge their question and direct them to the checkout link for full details` : ""}
${intent === "store_question" ? `- Answer their question directly using the store information provided. Be helpful and specific. If you don't have the exact information, direct them to the store website or suggest they contact support.` : ""}
${intent !== "product_question" && intent !== "variant_inquiry" && intent !== "store_question" && checkoutUrl ? `- Include this checkout link: ${checkoutUrl}` : ""}
${productName ? `- Product name: ${productName}` : ""}
- Keep it brief (2-3 sentences max)${customInstruction ? `` : ` and friendly`}
- CRITICAL: Instagram DMs only support plain text, NOT markdown. Do NOT use markdown formatting like [link text](url). Instead, write clear descriptive text before the URL, then include the URL (which will be automatically shortened for cleaner appearance). Instagram will automatically make URLs clickable. For example, write "Check it out here: https://is.gd/abc123" or "Checkout here: https://is.gd/xyz789" NOT "[Check it out here](https://example.com/product)". Make the text before the URL descriptive so users know what they're clicking (e.g., "Checkout here:", "See product details:", "View all colors:").
${intent === "price_request" ? "- The checkout link shows the price - mention this if you don't have the exact price" : ""}
${(intent === "product_question" || intent === "variant_inquiry") && productPageUrl ? "- Structure: Acknowledge question → Direct to product page link for details/variants → Optionally mention checkout link at the end if ready to buy" : ""}
${(intent === "product_question" || intent === "variant_inquiry") && !productPageUrl ? "- Don't make up details you don't know - just acknowledge their question and direct them to the link for full details" : ""}
${customInstruction ? `` : `- End with an offer to help with questions`}

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
          temperature: 0.8,
          max_tokens: 250, // Increased from 150 to allow for complete responses with links
        });

        if (response?.choices?.[0]?.message?.content) {
          message = response.choices[0].message.content.trim();
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

