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

import { logMessage, updateMessageAI, getSettings, getShopPlanAndUsage, alreadyRepliedToMessage, alreadyRepliedToComment } from "../lib/db.server";
import { classifyMessage } from "../lib/ai.server";
import { handleIncomingDm, handleIncomingComment } from "../lib/automation.server";
import { getInstagramMessageByMid } from "../lib/meta.server";
import { getPlanConfig } from "../lib/plans";
import supabase from "../lib/supabase.server";

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_INSTAGRAM_APP_SECRET = process.env.META_INSTAGRAM_APP_SECRET;

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
    
    let { data, error } = await query.maybeSingle();
    
    if (error || !data) {
      console.log(`[webhook] No shop found for page_id: ${pageId}, ig_business_id: ${igBusinessId}`);
      // Fallback: if one Instagram-connected shop exists, use it (webhook entry.id can differ from stored id for same account)
      if (igBusinessId) {
        const { data: fallbackRows } = await supabase
          .from("meta_auth")
          .select("shop_id")
          .not("ig_business_id", "is", null);
        if (fallbackRows && fallbackRows.length === 1) {
          const shopId = fallbackRows[0].shop_id;
          const { data: shop } = await supabase.from("shops").select("id, active").eq("id", shopId).single();
          if (shop?.active) {
            console.log(`[webhook] Using single Instagram shop fallback: shop_id=${shopId}`);
            // Self-correct stored ig_business_id so sendDmReply uses the webhook's ID (required for API)
            const { error: updateErr } = await supabase
              .from("meta_auth")
              .update({ ig_business_id: igBusinessId })
              .eq("shop_id", shopId);
            if (updateErr) {
              console.error(`[webhook] Failed to update meta_auth.ig_business_id for shop ${shopId}:`, updateErr);
            } else {
              console.log(`[webhook] Updated meta_auth.ig_business_id to ${igBusinessId} for shop ${shopId}`);
            }
            return shopId;
          }
        }
      }
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
      commentId:
        comment.id ||
        comment.comment_id ||
        comment.commentId ||
        comment?.comment?.id ||
        comment?.value?.id ||
        comment?.value?.comment_id,
      commentText: comment.text || comment.message || null,
      igUserId: comment.from?.id || comment.from?.username || null,
      mediaId:
        comment.media?.id ||
        comment.media_id ||
        comment.mediaId ||
        comment?.value?.media_id ||
        comment?.value?.media?.id ||
        null,
      createdTime: comment.timestamp || comment.created_time || new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[webhook] Error parsing comment event:`, error);
    return null;
  }
}

/**
 * Parse Instagram DM/message event
 * Instagram messaging webhooks have this structure:
 * {
 *   "sender": { "id": "..." },
 *   "recipient": { "id": "..." },
 *   "timestamp": 1234567890,
 *   "message": {
 *     "mid": "message_id",
 *     "text": "message text"
 *   }
 * }
 */
function parseMessageEvent(message) {
  try {
    // Instagram messaging events structure; message_edit has mid, text, num_edit
    const sender = message.sender || message.from;
    const messageData = message.message || message;
    const messageEdit = message.message_edit;
    
    // Extract message ID - message_edit.mid or message.mid
    const messageId = messageEdit?.mid || messageData?.mid || messageData?.id || message.id || message.message_id || message.mid;
    
    // Extract message text (message_edit can include edited text)
    const messageText = messageEdit?.text || messageData?.text || messageData?.body || message.text || message.body || null;
    
    // Extract sender ID
    const igUserId = sender?.id || message.from?.id || message.sender_id || null;
    
    // Extract timestamp (can be in seconds or milliseconds)
    let timestamp = messageData?.timestamp || message.timestamp || new Date().toISOString();
    if (typeof timestamp === 'number') {
      // Convert to ISO string (timestamp might be in seconds, not milliseconds)
      timestamp = timestamp < 10000000000 
        ? new Date(timestamp * 1000).toISOString() 
        : new Date(timestamp).toISOString();
    }
    
    return {
      messageId,
      messageText,
      igUserId,
      timestamp,
    };
  } catch (error) {
    console.error(`[webhook] Error parsing message event:`, error);
    return null;
  }
}

/**
 * POST handler for webhook events
 * Meta sends POST requests with actual webhook events.
 *
 * Why two webhooks for one customer message? Meta often sends (1) an inbound
 * "message" or "message_edit" for the customer's message, and (2) an "echo"
 * when your business account sends a reply. Each is a separate POST.
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

    // Verify HMAC signature: Meta signs with the app that owns the webhook (main or Instagram app)
    const secrets = [META_APP_SECRET, META_INSTAGRAM_APP_SECRET].filter(Boolean);
    if (signature && secrets.length > 0) {
      const expectedSignatures = secrets.map((secret) =>
        `sha256=${crypto.createHmac("sha256", secret).update(bodyText).digest("hex")}`
      );
      const valid = expectedSignatures.some((expected) => signature === expected);
      if (!valid) {
        console.error(`[webhook] Invalid HMAC signature (tried ${secrets.length} secret(s))`);
        return new Response("Invalid signature", { status: 403 });
      }
      console.log(`[webhook] HMAC signature verified`);
    } else {
      console.log(`[webhook] HMAC verification skipped (no app secret or signature)`);
    }

    // Parse JSON body
    const body = JSON.parse(bodyText);
    const entryCount = body.entry?.length ?? 0;
    const firstEntryKeys = body.entry?.[0] ? Object.keys(body.entry[0]).join(", ") : "";
    console.log(`[webhook] POST object=${body.object} entries=${entryCount} keys=[${firstEntryKeys}]`);

    // Handle different webhook event types
    if (body.object === "instagram") {
      if (body.entry) {
        for (const entry of body.entry) {
          const igBusinessId = entry.id != null ? String(entry.id) : null;
          const nMessaging = entry.messaging?.length ?? 0;
          const nStandby = entry.standby?.length ?? 0;
          const nChangeMsg = entry.changes?.filter((c) => c.field === "messages").length ?? 0;
          console.log(`[webhook] entry id=${igBusinessId} messaging=${nMessaging} standby=${nStandby} change_messages=${nChangeMsg}`);

          const shopId = await resolveShopFromEvent(null, igBusinessId);
          if (!shopId) {
            console.warn(`[webhook] No shop for ig_business_id=${igBusinessId}, skipping`);
            continue;
          }
          console.log(`[webhook] shop_id=${shopId}`);

          let settings = null;
          try {
            settings = await getSettings(shopId);
          } catch (error) {
            console.error(`[webhook] Error fetching settings:`, error);
            // Continue processing - default to enabled if settings can't be fetched
          }
          
          // Build list of message events: entry.messaging, entry.standby, or entry.changes (Graph API "messages" format)
          let messagingEvents = [];
          if (entry.messaging && Array.isArray(entry.messaging)) {
            messagingEvents = entry.messaging;
          }
          if (entry.standby && Array.isArray(entry.standby)) {
            console.log(`[webhook] Including ${entry.standby.length} event(s) from entry.standby (app was not thread owner)`);
            messagingEvents = messagingEvents.concat(entry.standby);
          }
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.field === "messages" && change.value) {
                messagingEvents.push(change.value);
              }
            }
          }

          if (messagingEvents.length === 0) {
            const changeFields = entry.changes?.map((c) => c.field).join(", ") || "(none)";
            console.log(`[webhook] No messaging events in this entry. entry keys=[${Object.keys(entry).join(", ")}] changes.fields=[${changeFields}]`);
          }

          // Handle messaging events (DMs)
          if (messagingEvents.length > 0) {
            // Check if DM automation is enabled
            if (settings?.dm_automation_enabled === false) {
              console.log(`[webhook] DM automation is disabled for shop ${shopId}, skipping DM processing`);
            } else if (settings?.channel_preference === "comment") {
              // Pro plan: check channel preference
              console.log(`[webhook] Channel preference is "comment only", skipping DM processing`);
            } else {
            console.log(`[webhook] Found ${messagingEvents.length} messaging event(s)`);
            for (const message of messagingEvents) {
              const senderId = message.sender?.id ?? message.from?.id ?? "?";
              const isEcho = message.is_echo === true || message.message?.is_echo === true;
              const hasEditMid = !!message.message_edit?.mid;
              console.log(`[webhook] Event: sender=${senderId} is_echo=${isEcho} message_edit.mid=${hasEditMid ? "yes" : "no"}`);
              if (igBusinessId && String(senderId) === String(igBusinessId)) {
                console.log(`[webhook] Skipping outbound message from IG business ID ${igBusinessId}`);
                continue;
              }
              if (isEcho) {
                console.log(`[webhook] Skipping is_echo (outbound) message`);
                continue;
              }
              // Process: message with text/attachments, or message_edit with text (edited message content)
              let messageToProcess = message;
              let hasMessageText = message.message?.text || message.message?.attachments?.length;
              let hasMessageEditText = message.message_edit?.text;

              if (!hasMessageText && !hasMessageEditText && message.message_edit?.mid) {
                // message_edit without text: fetch content via Graph API so we can log and reply
                console.log(`[webhook] message_edit (no text in payload): fetching message by mid from Graph API...`);
                const fetched = await getInstagramMessageByMid(shopId, message.message_edit.mid);
                if (fetched?.text) {
                  messageToProcess = {
                    sender: message.sender || { id: fetched.fromId },
                    recipient: message.recipient,
                    timestamp: message.timestamp,
                    message: {
                      mid: message.message_edit.mid,
                      text: fetched.text,
                      timestamp: message.timestamp,
                    },
                  };
                  hasMessageText = true;
                  console.log(`[webhook] Fetched message text (${fetched.text.length} chars), will log and run automation`);
                } else {
                  console.log(`[webhook] Skipping message_edit (fetch returned no text)`);
                  continue;
                }
              } else if (!hasMessageText && !hasMessageEditText) {
                if (message.message_edit) {
                  console.log(`[webhook] Skip: message_edit (no text in payload)`);
                } else {
                  console.log(`[webhook] Skip: non-message event (reaction/read)`);
                }
                continue;
              }

              const parsed = parseMessageEvent(messageToProcess);
              if (!parsed || !parsed.messageId) {
                console.warn(`[webhook] Skip: parse failed mid=${messageToProcess.message?.mid ?? messageToProcess.message_edit?.mid ?? "?"}`);
                continue;
              }
              console.log(`[webhook] Inbound: from=${parsed.igUserId} text_len=${(parsed.messageText || "").length} mid=${parsed.messageId?.slice?.(0, 20)}...`);
              
              try {
                const result = await logMessage({
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
                console.log(`[webhook] DM logged db_id=${result?.id}`);
                
                // Skip classification + automation if we already replied (stops API loop on duplicate webhooks)
                if (result?.id && (await alreadyRepliedToMessage(result.id))) {
                  console.log(`[webhook] Already replied to message ${result.id}, skipping classification and automation`);
                } else if (result?.id && parsed.messageText) {
                  classifyMessage(parsed.messageText, { shopId })
                    .then(async (classification) => {
                      if (classification.intent !== null && !classification.error) {
                        // Update message with AI classification
                        await updateMessageAI(
                          result.id,
                          classification.intent,
                          classification.confidence,
                          classification.sentiment
                        );

                        // Fetch updated message with AI data for automation
                        const { data: updatedMessage } = await supabase
                          .from("messages")
                          .select("*")
                          .eq("id", result.id)
                          .single();

                        if (updatedMessage) {
                          // Get shop and plan for automation
                          try {
                            const usageData = await getShopPlanAndUsage(shopId);
                            if (usageData) {
                              // Get shop data from Supabase
                              const { data: shopData } = await supabase
                                .from("shops")
                                .select("*")
                                .eq("id", shopId)
                                .single();

                              if (shopData) {
                                const shop = shopData;
                                const plan = getPlanConfig(shop.plan || "FREE");

                                // Process automation (send DM reply if conditions are met)
                                handleIncomingDm(updatedMessage, shop, plan)
                                  .then((automationResult) => {
                                    if (automationResult.sent) {
                                      console.log(`[webhook] ✅ Automated DM sent for message ${result.id}`);
                                    } else {
                                      console.log(`[webhook] Automation skipped for message ${result.id}: ${automationResult.reason}`);
                                    }
                                  })
                                  .catch((error) => {
                                    console.error(`[webhook] Error in automation:`, error);
                                    // Don't throw - automation failure shouldn't break webhook
                                  });
                              }
                            }
                          } catch (error) {
                            console.error(`[webhook] Error getting shop/plan for automation:`, error);
                            // Don't throw - continue processing
                          }
                        }
                      }
                    })
                    .catch((error) => {
                      console.error(`[webhook] Error classifying message:`, error);
                      // Don't throw - classification failure shouldn't break webhook
                    });
                }
              } catch (error) {
                console.error(`[webhook] Error logging DM:`, error);
                console.error(`[webhook] Error stack:`, error.stack);
                // Continue processing other messages
              }
            }
            }
          } else {
            console.log(`[webhook] No messaging events in entry (keys: ${Object.keys(entry).join(", ")})`);
          }
          
          // Handle comment events (from entry.changes)
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === "comments" && change.value) {
                // Check if comment automation is enabled
                if (settings?.comment_automation_enabled === false) {
                  console.log(`[webhook] Comment automation is disabled for shop ${shopId}, skipping comment processing`);
                  continue;
                }
                
                // Check channel preference (Pro only)
                if (settings?.channel_preference === "dm") {
                  console.log(`[webhook] Channel preference is "DM only", skipping comment processing`);
                  continue;
                }
                
                const comment = change.value;
                console.log(`[webhook] Instagram comment event:`, comment);
                
                const parsed = parseCommentEvent(comment);
                if (!parsed || !parsed.commentId) {
                  console.warn(`[webhook] Failed to parse comment event, skipping`);
                  continue;
                }
                
                // Check if post filtering is enabled and if this post is in the allowed list
                if (settings?.enabled_post_ids && Array.isArray(settings.enabled_post_ids) && settings.enabled_post_ids.length > 0) {
                  if (!parsed.mediaId || !settings.enabled_post_ids.includes(parsed.mediaId)) {
                    console.log(`[webhook] Comment on media ${parsed.mediaId} not in enabled_post_ids list, skipping`);
                    continue;
                  }
                }
                
                try {
                const result = await logMessage({
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
                
                // Skip classification + automation if we already replied to this comment (stops API loop on duplicate webhooks)
                if (result?.id && (await alreadyRepliedToComment(shopId, parsed.commentId))) {
                  console.log(`[webhook] Already replied to comment ${parsed.commentId}, skipping classification and automation`);
                } else if (result?.id && parsed.commentText) {
                  classifyMessage(parsed.commentText, { shopId })
                    .then(async (classification) => {
                      if (classification.intent !== null && !classification.error) {
                        // Update message with AI classification
                        await updateMessageAI(
                          result.id,
                          classification.intent,
                          classification.confidence,
                          classification.sentiment
                        );

                        // Fetch updated message with AI data for automation
                        const { data: updatedMessage } = await supabase
                          .from("messages")
                          .select("*")
                          .eq("id", result.id)
                          .single();

                        if (updatedMessage && parsed.mediaId) {
                          // Get shop and plan for automation
                          try {
                            const usageData = await getShopPlanAndUsage(shopId);
                            if (usageData) {
                              // Get shop data from Supabase
                              const { data: shopData } = await supabase
                                .from("shops")
                                .select("*")
                                .eq("id", shopId)
                                .single();

                              if (shopData) {
                                const shop = shopData;
                                const plan = getPlanConfig(shop.plan || "FREE");

                                // Process comment-to-DM automation (Growth/Pro only)
                                handleIncomingComment(updatedMessage, parsed.mediaId, shop, plan)
                                  .then((automationResult) => {
                                    if (automationResult.sent) {
                                      console.log(`[webhook] ✅ Comment-to-DM sent for comment ${result.id}`);
                                    } else {
                                      console.log(`[webhook] Comment-to-DM skipped for comment ${result.id}: ${automationResult.reason}`);
                                    }
                                  })
                                  .catch((error) => {
                                    console.error(`[webhook] Error in comment automation:`, error);
                                    // Don't throw - automation failure shouldn't break webhook
                                  });
                              }
                            }
                          } catch (error) {
                            console.error(`[webhook] Error getting shop/plan for comment automation:`, error);
                            // Don't throw - continue processing
                          }
                        }
                      }
                    })
                    .catch((error) => {
                      console.error(`[webhook] Error classifying comment:`, error);
                      // Don't throw - classification failure shouldn't break webhook
                    });
                }
                } catch (error) {
                  console.error(`[webhook] Error logging comment:`, error);
                  // Continue processing other comments
                }
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



