/**
 * Follow-Up Automation for Pro Plans
 * Sends follow-up DMs 23-24 hours after last message if no click was recorded
 */

import { getShopPlanAndUsage, getSettings, getBrandVoice } from "./db.server";
import { sendDmReply } from "./automation.server";
import supabase from "./supabase.server";
import { logError } from "./error-handler.server";

/**
 * Check if a follow-up has already been sent for a message/link combination
 */
async function hasFollowupBeenSent(shopId, messageId, linkId) {
  const { data, error } = await supabase
    .from("followups")
    .select("id")
    .eq("shop_id", shopId)
    .eq("message_id", messageId)
    .eq("link_id", linkId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("[followup] Error checking followup status:", error);
    return false; // Assume not sent if error
  }

  return !!data;
}

/**
 * Mark a follow-up as sent
 */
async function markFollowupSent(shopId, messageId, linkId) {
  const { error } = await supabase
    .from("followups")
    .insert({
      shop_id: shopId,
      message_id: messageId,
      link_id: linkId,
    });

  if (error) {
    console.error("[followup] Error marking followup as sent:", error);
    throw error;
  }
}

/**
 * Check if a link has been clicked
 */
async function hasLinkBeenClicked(linkId) {
  const { count, error } = await supabase
    .from("clicks")
    .select("*", { count: "exact", head: true })
    .eq("link_id", linkId);

  if (error) {
    console.error("[followup] Error checking clicks:", error);
    return false; // Assume not clicked if error
  }

  return (count || 0) > 0;
}

/**
 * Process follow-ups for all eligible shops
 * This should be called by a scheduled job (cron) every hour
 */
export async function processFollowups() {
  console.log("[followup] Starting follow-up processing...");

  try {
    // Calculate time window: 23-24 hours ago
    const now = new Date();
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get all PRO shops with followup_enabled = true
    const { data: proShops, error: shopsError } = await supabase
      .from("shops")
      .select("id, shopify_domain, plan")
      .eq("plan", "PRO")
      .eq("active", true);

    if (shopsError) {
      console.error("[followup] Error fetching PRO shops:", shopsError);
      return;
    }

    if (!proShops || proShops.length === 0) {
      console.log("[followup] No PRO shops found");
      return;
    }

    // Check settings for each shop
    for (const shop of proShops) {
      try {
        const settings = await getSettings(shop.id);
        
        if (!settings?.followup_enabled) {
          console.log(`[followup] Follow-up disabled for shop ${shop.id}`);
          continue;
        }

        // Get messages where:
        // 1. last_user_message_at is between 23-24 hours ago
        // 2. Has a link sent
        // 3. No follow-up has been sent yet
        // First, get all messages in the time window
        const { data: allMessages, error: messagesError } = await supabase
          .from("messages")
          .select(`
            id,
            channel,
            from_user_id,
            last_user_message_at,
            created_at
          `)
          .eq("shop_id", shop.id)
          .eq("channel", "dm") // Only DMs for follow-ups
          .gte("last_user_message_at", twentyFourHoursAgo.toISOString())
          .lte("last_user_message_at", twentyThreeHoursAgo.toISOString())
          .not("last_user_message_at", "is", null);

        if (messagesError) {
          console.error(`[followup] Error fetching messages for shop ${shop.id}:`, messagesError);
          continue;
        }

        if (!allMessages || allMessages.length === 0) {
          continue;
        }

        // Get links_sent for these messages
        const messageIds = allMessages.map(m => m.id);
        const { data: linksSent, error: linksError } = await supabase
          .from("links_sent")
          .select("id, message_id, link_id")
          .eq("shop_id", shop.id)
          .in("message_id", messageIds);

        if (linksError) {
          console.error(`[followup] Error fetching links for shop ${shop.id}:`, linksError);
          continue;
        }

        // Create map of message_id -> link_id (get most recent link per message)
        const messageToLinkId = {};
        (linksSent || []).forEach(link => {
          if (link.message_id && (!messageToLinkId[link.message_id] || link.id > messageToLinkId[link.message_id])) {
            messageToLinkId[link.message_id] = link.link_id;
          }
        });

        // Filter messages that have links sent
        const messages = allMessages.filter(m => messageToLinkId[m.id]);

        // Process each message
        for (const message of messages) {
          try {
            // Get the most recent link sent for this message
            const linkId = messageToLinkId[message.id];
            if (!linkId) {
              continue;
            }

            // Check if follow-up already sent
            if (await hasFollowupBeenSent(shop.id, message.id, linkId)) {
              continue;
            }

            // Check if link has been clicked
            if (await hasLinkBeenClicked(linkId)) {
              // Link was clicked, no need for follow-up
              continue;
            }

            // Get shop plan and usage
            const { shop: shopData, plan } = await getShopPlanAndUsage(shop.id);
            if (!shopData || !plan) {
              continue;
            }

            // Get brand voice
            const brandVoice = await getBrandVoice(shop.id);

            // Generate follow-up message
            const followupMessage = generateFollowupMessage(brandVoice);

            // Send follow-up DM
            await sendDmReply(shop.id, message.from_user_id, followupMessage);

            // Mark follow-up as sent
            await markFollowupSent(shop.id, message.id, linkId);

            console.log(`[followup] ✅ Follow-up sent for message ${message.id} in shop ${shop.id}`);
          } catch (error) {
            logError("processFollowups - message", error, { shopId: shop.id, messageId: message.id });
          }
        }
      } catch (error) {
        logError("processFollowups - shop", error, { shopId: shop.id });
      }
    }

    console.log("[followup] Follow-up processing completed");
  } catch (error) {
    logError("processFollowups", error);
  }
}

/**
 * Generate a follow-up message based on brand voice
 */
function generateFollowupMessage(brandVoice) {
  const tone = brandVoice?.tone || "friendly";
  const customInstruction = brandVoice?.custom_instruction || null;

  const toneMessages = {
    friendly: "Hi! Just checking in - did you have any questions about the product? I'm here to help! 😊",
    expert: "Hello, I wanted to follow up on your inquiry. Please let me know if you have any questions or need additional information.",
    casual: "Hey! 👋 Just wanted to check in - any questions? Happy to help!",
  };

  let message = toneMessages[tone] || toneMessages.friendly;

  // Apply custom instruction if provided
  if (customInstruction) {
    message = `${customInstruction}\n\n${message}`;
  }

  return message;
}

