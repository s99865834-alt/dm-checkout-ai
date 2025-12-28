/**
 * Meta/Instagram Webhook Handler
 * Handles webhook verification and events from Meta (Instagram/Facebook)
 * 
 * Week 6: Basic webhook verification and event logging
 * Week 8: Message/comment processing and storage
 */

// Polyfill crypto for Meta webhook HMAC validation
import crypto from "crypto";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}

import { logMessage } from "../lib/db.server";
import supabase from "../lib/supabase.server";

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;

/**
 * GET handler for webhook verification
 * Meta sends a GET request to verify your webhook endpoint
 * 
 * Verification flow:
 * 1. Meta sends: GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=RANDOM_STRING
 * 2. We verify the token matches META_WEBHOOK_VERIFY_TOKEN
 * 3. We return the challenge string to prove we control the endpoint
 */
export const loader = async ({ request }) => {
  console.log(`[webhook] Meta webhook verification request received`);
  
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log(`[webhook] Verification params:`, {
      mode,
      token: token ? "***" : null,
      challenge: challenge ? "***" : null,
    });

    // Verify the token matches
    if (mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN) {
      console.log(`[webhook] Meta webhook verified successfully`);
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    } else {
      console.error(`[webhook] Meta webhook verification failed:`, {
        mode,
        tokenMatch: token === META_WEBHOOK_VERIFY_TOKEN,
        hasToken: !!token,
        hasVerifyToken: !!META_WEBHOOK_VERIFY_TOKEN,
      });
      return new Response("Forbidden", { status: 403 });
    }
  } catch (error) {
    console.error(`[webhook] Error during webhook verification:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

/**
 * Resolve shop from Meta webhook event
 * Matches page_id or ig_business_id from the event to meta_auth records
 */
async function resolveShopFromEvent(pageId, igBusinessId) {
  try {
    let query = supabase.from("meta_auth").select("shop_id");
    
    // Prioritize ig_business_id for Instagram events
    if (igBusinessId) {
      query = query.eq("ig_business_id", igBusinessId);
    } else if (pageId) {
      // For Facebook Page events
      query = query.eq("page_id", pageId);
    } else {
      console.log(`[webhook] No page_id or ig_business_id provided`);
      return null;
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error || !data) {
      console.log(`[webhook] No shop found for page_id: ${pageId}, ig_business_id: ${igBusinessId}`);
      return null;
    }
    
    // Verify shop is active
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, active")
      .eq("id", data.shop_id)
      .single();
    
    if (shopError || !shop || !shop.active) {
      console.log(`[webhook] Shop ${data.shop_id} not found or inactive`);
      return null;
    }
    
    console.log(`[webhook] Resolved shop ${shop.id} for page_id: ${pageId}, ig_business_id: ${igBusinessId}`);
    return shop.id;
  } catch (error) {
    console.error(`[webhook] Error resolving shop:`, error);
    return null;
  }
}

/**
 * Parse Instagram comment event
 */
function parseCommentEvent(comment) {
  try {
    return {
      commentId: comment.id || comment.comment_id,
      commentText: comment.text || comment.message || null,
      igUserId: comment.from?.id || comment.from?.username || null,
      mediaId: comment.media?.id || comment.media_id || null,
      createdTime: comment.timestamp || comment.created_time || new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[webhook] Error parsing comment event:`, error);
    return null;
  }
}

/**
 * Parse Instagram DM/message event
 */
function parseMessageEvent(message) {
  try {
    // Instagram messaging events structure
    const sender = message.sender || message.from;
    const messageData = message.message || message;
    
    return {
      messageId: messageData.mid || message.id || message.message_id,
      messageText: messageData.text || messageData.body || null,
      igUserId: sender?.id || message.from?.id || null,
      timestamp: messageData.timestamp || message.timestamp || new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[webhook] Error parsing message event:`, error);
    return null;
  }
}

/**
 * POST handler for webhook events
 * Meta sends POST requests with actual webhook events
 * 
 * Week 8: Processes comments and DMs, stores them in messages table
 */
export const action = async ({ request }) => {
  console.log(`[webhook] Meta webhook event received`);
  
  if (request.method !== "POST") {
    console.error(`[webhook] Invalid method: ${request.method}`);
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Read body as text first for HMAC verification
    const bodyText = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    // Verify HMAC signature if app secret is configured
    if (META_APP_SECRET && signature) {
      const expectedSignature = `sha256=${crypto
        .createHmac("sha256", META_APP_SECRET)
        .update(bodyText)
        .digest("hex")}`;

      if (signature !== expectedSignature) {
        console.error(`[webhook] Invalid HMAC signature`);
        console.error(`[webhook] Expected: ${expectedSignature.substring(0, 20)}...`);
        console.error(`[webhook] Received: ${signature?.substring(0, 20)}...`);
        return new Response("Invalid signature", { status: 403 });
      }
      console.log(`[webhook] HMAC signature verified`);
    } else {
      console.log(`[webhook] HMAC verification skipped (no app secret or signature)`);
    }

    // Parse JSON body
    const body = JSON.parse(bodyText);
    console.log(`[webhook] Meta webhook event:`, JSON.stringify(body, null, 2));

    // Handle different webhook event types
    if (body.object === "instagram") {
      console.log(`[webhook] Instagram webhook event`);
      
      if (body.entry) {
        for (const entry of body.entry) {
          console.log(`[webhook] Processing entry:`, entry.id);
          
          // For Instagram webhooks, entry.id is the Instagram Business Account ID
          // We need to resolve shop using this ID
          const shopId = await resolveShopFromEvent(null, entry.id);
          
          if (!shopId) {
            console.warn(`[webhook] Could not resolve shop for Instagram Business Account ${entry.id}, skipping`);
            continue;
          }
          
          // Handle messaging events (DMs)
          if (entry.messaging) {
            for (const message of entry.messaging) {
              console.log(`[webhook] Instagram message event:`, message);
              
              const parsed = parseMessageEvent(message);
              if (!parsed || !parsed.messageId) {
                console.warn(`[webhook] Failed to parse message event, skipping`);
                continue;
              }
              
              try {
                await logMessage({
                  shopId,
                  channel: "dm",
                  externalId: parsed.messageId,
                  fromUserId: parsed.igUserId,
                  text: parsed.messageText,
                  aiIntent: null,
                  aiConfidence: null,
                  sentiment: null,
                  lastUserMessageAt: parsed.timestamp,
                });
                console.log(`[webhook] ✅ DM logged: ${parsed.messageId}`);
              } catch (error) {
                console.error(`[webhook] Error logging DM:`, error);
                // Continue processing other messages
              }
            }
          }
          
          // Handle comment events
          if (entry.comments) {
            for (const comment of entry.comments) {
              console.log(`[webhook] Instagram comment event:`, comment);
              
              const parsed = parseCommentEvent(comment);
              if (!parsed || !parsed.commentId) {
                console.warn(`[webhook] Failed to parse comment event, skipping`);
                continue;
              }
              
              try {
                await logMessage({
                  shopId,
                  channel: "comment",
                  externalId: parsed.commentId,
                  fromUserId: parsed.igUserId,
                  text: parsed.commentText,
                  aiIntent: null,
                  aiConfidence: null,
                  sentiment: null,
                  lastUserMessageAt: null, // Comments don't use last_user_message_at
                });
                console.log(`[webhook] ✅ Comment logged: ${parsed.commentId}`);
              } catch (error) {
                console.error(`[webhook] Error logging comment:`, error);
                // Continue processing other comments
              }
            }
          }
        }
      }
    } else if (body.object === "page") {
      console.log(`[webhook] Facebook Page webhook event`);
      
      if (body.entry) {
        for (const entry of body.entry) {
          console.log(`[webhook] Processing page entry:`, entry.id);
          
          // Resolve shop from page_id
          const shopId = await resolveShopFromEvent(entry.id, null);
          
          if (!shopId) {
            console.warn(`[webhook] Could not resolve shop for page ${entry.id}, skipping`);
            continue;
          }
          
          if (entry.messaging) {
            for (const message of entry.messaging) {
              console.log(`[webhook] Facebook message event:`, message);
              
              const parsed = parseMessageEvent(message);
              if (!parsed || !parsed.messageId) {
                console.warn(`[webhook] Failed to parse Facebook message event, skipping`);
                continue;
              }
              
              try {
                await logMessage({
                  shopId,
                  channel: "dm",
                  externalId: parsed.messageId,
                  fromUserId: parsed.igUserId,
                  text: parsed.messageText,
                  aiIntent: null,
                  aiConfidence: null,
                  sentiment: null,
                  lastUserMessageAt: parsed.timestamp,
                });
                console.log(`[webhook] ✅ Facebook DM logged: ${parsed.messageId}`);
              } catch (error) {
                console.error(`[webhook] Error logging Facebook DM:`, error);
                // Continue processing other messages
              }
            }
          }
        }
      }
    } else {
      console.log(`[webhook] Unknown webhook object type: ${body.object}`);
    }

    // Always return 200 to acknowledge receipt (prevents retries)
    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error(`[webhook] Error processing Meta webhook:`, error);
    console.error(`[webhook] Error stack:`, error.stack);
    
    // Return 200 even on error to prevent Meta from retrying
    // (We'll log the error for debugging)
    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
};



