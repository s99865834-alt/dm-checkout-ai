/**
 * Follow-Up Automation for Pro Plans
 * Sends follow-up DMs 23-24 hours after last message if no click was recorded.
 *
 * Concurrency notes:
 *   - The followups table has a UNIQUE INDEX on (shop_id, message_id, link_id).
 *   - We CLAIM each follow-up by inserting that row BEFORE sending the DM.
 *   - If the insert fails with PG 23505 (unique violation) another tick has
 *     already claimed it and we skip silently.
 *   - This is bulletproof against multiple ticks, multiple instances, and
 *     server restarts that re-trigger the startup tick of the in-process
 *     scheduler within the 23–24h window.
 *
 * Brand-voice notes:
 *   - We never prepend `custom_instruction` text to the customer-facing
 *     message. The instruction is treated as a style directive and applied
 *     via OpenAI. If AI is unavailable we fall back to a canned tone-based
 *     message (no instruction text included).
 */

import OpenAI from "openai";
import { getShopPlanAndUsage, getSettings, getBrandVoice } from "./db.server";
import { sendDmReply } from "./automation.server";
import { REPLY_MODEL, completionParamsForModel } from "./sales-agent.server";
import supabase from "./supabase.server";
import { logError } from "./error-handler.server";
import logger from "./logger.server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const FALLBACK_BY_TONE = {
  friendly:
    "Hi! Just checking in — did you have any questions about the product? I'm here to help! 😊",
  expert:
    "Hello, I wanted to follow up on your inquiry. Please let me know if you have any questions or need additional information.",
  casual: "Hey! 👋 Just wanted to check in — any questions? Happy to help!",
};

/**
 * Atomically claim a follow-up slot. Returns true if we successfully claimed
 * (caller should now send the DM). Returns false if another worker has
 * already claimed it (caller should skip silently). Throws on real errors.
 */
async function claimFollowupSlot(shopId, messageId, linkId) {
  const { error } = await supabase
    .from("followups")
    .insert({ shop_id: shopId, message_id: messageId, link_id: linkId });

  if (!error) return true;

  // 23505 = PG unique_violation → already claimed by another tick / instance.
  if (error.code === "23505") return false;

  throw error;
}

/**
 * Release a previously-claimed follow-up slot. Used only when the actual DM
 * send fails so we don't permanently block a retry on the next hourly tick
 * (still inside the 23–24h window).
 */
async function releaseFollowupSlot(shopId, messageId, linkId) {
  try {
    await supabase
      .from("followups")
      .delete()
      .eq("shop_id", shopId)
      .eq("message_id", messageId)
      .eq("link_id", linkId);
  } catch (err) {
    console.error("[followup] Error releasing followup slot:", err);
  }
}

/**
 * Check if the customer clicked ANY of the given links.
 */
async function hasAnyLinkBeenClicked(linkIds) {
  if (!linkIds || linkIds.length === 0) return false;
  const { count, error } = await supabase
    .from("clicks")
    .select("*", { count: "exact", head: true })
    .in("link_id", linkIds);

  if (error) {
    console.error("[followup] Error checking clicks:", error);
    return false; // Assume not clicked if error
  }

  return (count || 0) > 0;
}

/**
 * Products that recent follow-ups (past 7 days) to this customer were
 * chasing. Returns:
 *   - null       → no recent follow-up (a new one is allowed)
 *   - Set<gid>   → product IDs of the links those follow-ups nudged about
 *   - "unknown"  → a follow-up was sent but its product can't be determined
 *                  (or a lookup failed) — treat as blocking, fail closed
 *
 * One follow-up per CONVERSATION, where a conversation is defined by product:
 * a reply to the follow-up about the same product must not restart the clock,
 * but a genuinely new exchange about a different product (new comment, new
 * question) gets its own single follow-up even within the 7 days.
 */
async function recentFollowupProducts(shopId, fromUserId) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: msgs, error: msgsError } = await supabase
    .from("messages")
    .select("id")
    .eq("shop_id", shopId)
    .eq("from_user_id", fromUserId)
    .gte("created_at", since);
  if (msgsError) {
    console.error("[followup] Error fetching user messages:", msgsError);
    return "unknown"; // fail closed: better to skip than double-send
  }
  const ids = (msgs || []).map((m) => m.id);
  if (ids.length === 0) return null;

  const { data: followups, error: fuError } = await supabase
    .from("followups")
    .select("link_id")
    .eq("shop_id", shopId)
    .in("message_id", ids);
  if (fuError) {
    console.error("[followup] Error checking existing followups:", fuError);
    return "unknown"; // fail closed
  }
  if (!followups || followups.length === 0) return null;

  const linkIds = followups.map((f) => f.link_id).filter(Boolean);
  if (linkIds.length === 0) return "unknown";

  const { data: links, error: linksError } = await supabase
    .from("links_sent")
    .select("product_id")
    .eq("shop_id", shopId)
    .in("link_id", linkIds);
  if (linksError) {
    console.error("[followup] Error resolving followup products:", linksError);
    return "unknown"; // fail closed
  }
  const products = new Set((links || []).map((l) => l.product_id).filter(Boolean));
  return products.size > 0 ? products : "unknown";
}

/**
 * True when the customer sent another DM after this message — they responded,
 * so the conversation moved on and this exchange must not get a follow-up.
 * (If the newer exchange goes quiet with an unclicked link, it triggers its
 * own follow-up when it crosses the 23-24h window.)
 */
async function customerRespondedAfter(shopId, fromUserId, createdAt) {
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("shop_id", shopId)
    .eq("channel", "dm")
    .eq("from_user_id", fromUserId)
    .gt("created_at", createdAt)
    .limit(1);
  if (error) {
    console.error("[followup] Error checking newer messages:", error);
    return true; // fail closed: skip rather than risk a redundant follow-up
  }
  return !!(data && data.length > 0);
}

/**
 * Process follow-ups for all eligible shops
 * This should be called by a scheduled job (cron) every hour
 */
export async function processFollowups() {
  logger.debug("[followup] Starting follow-up processing...");

  try {
    // Calculate time window: 23-24 hours ago
    const now = new Date();
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get all PRO (or beta-trial) shops with followup_enabled = true.
    // Beta-trial shops are stored as plan="FREE" but get PRO features at
    // runtime, so we need to include them via beta_trial_expires_at.
    const nowIso = now.toISOString();
    const { data: proShops, error: shopsError } = await supabase
      .from("shops")
      .select("id, shopify_domain, plan, beta_trial_expires_at")
      .eq("active", true)
      .or(`plan.eq.PRO,beta_trial_expires_at.gt.${nowIso}`);

    if (shopsError) {
      console.error("[followup] Error fetching PRO shops:", shopsError);
      return;
    }

    if (!proShops || proShops.length === 0) {
      logger.debug("[followup] No PRO shops found");
      return;
    }

    // Check settings for each shop
    for (const shop of proShops) {
      try {
        const settings = await getSettings(shop.id);

        if (!settings?.followup_enabled) {
          logger.debug(`[followup] Follow-up disabled for shop ${shop.id}`);
          continue;
        }

        // Get messages where:
        // 1. last_user_message_at is between 23-24 hours ago
        // 2. Has a link sent
        // 3. No follow-up has been sent yet
        // First, get all messages in the time window
        const { data: allMessages, error: messagesError } = await supabase
          .from("messages")
          .select(
            `
            id,
            channel,
            from_user_id,
            last_user_message_at,
            created_at
          `
          )
          .eq("shop_id", shop.id)
          .eq("channel", "dm") // Only DMs for follow-ups
          .gte("last_user_message_at", twentyFourHoursAgo.toISOString())
          .lte("last_user_message_at", twentyThreeHoursAgo.toISOString())
          .not("last_user_message_at", "is", null);

        if (messagesError) {
          console.error(
            `[followup] Error fetching messages for shop ${shop.id}:`,
            messagesError
          );
          continue;
        }

        if (!allMessages || allMessages.length === 0) {
          continue;
        }

        // Get real outbound links for these messages. url IS NOT NULL excludes
        // the dm_reply_* claim rows (url=null) that made EVERY replied message
        // look like it had a link; info_ shortlinks (policy pages etc.) don't
        // count either — follow-ups are about unclicked product links.
        const messageIds = allMessages.map((m) => m.id);
        const { data: linksSent, error: linksError } = await supabase
          .from("links_sent")
          .select("id, message_id, link_id, url, product_id")
          .eq("shop_id", shop.id)
          .in("message_id", messageIds)
          .not("url", "is", null);

        if (linksError) {
          console.error(
            `[followup] Error fetching links for shop ${shop.id}:`,
            linksError
          );
          continue;
        }

        // Map message_id → all its product links (checkout + PDP).
        const messageToLinks = {};
        (linksSent || []).forEach((link) => {
          if (!link.message_id || !link.link_id) return;
          if (link.link_id.startsWith("info_") || link.link_id.startsWith("followup_")) return;
          (messageToLinks[link.message_id] ||= []).push({
            linkId: link.link_id,
            productId: link.product_id || null,
          });
        });

        // ONE candidate per customer: their most recent linked message in the
        // window. A single session usually produces several linked messages,
        // and they cross the 23-24h window on different hourly ticks — without
        // this collapse, each one earned its own follow-up (customers got
        // duplicate check-ins an hour apart).
        const byUser = new Map();
        for (const m of allMessages) {
          if (!messageToLinks[m.id] || !m.from_user_id) continue;
          const prev = byUser.get(m.from_user_id);
          if (!prev || new Date(m.created_at) > new Date(prev.created_at)) {
            byUser.set(m.from_user_id, m);
          }
        }

        // Process one candidate message per customer
        for (const message of byUser.values()) {
          let claimed = false;
          const links = messageToLinks[message.id];
          const linkIds = links.map((l) => l.linkId);
          const claimLinkId = linkIds[0];
          try {
            // Skip if the customer wrote back after this message.
            if (await customerRespondedAfter(shop.id, message.from_user_id, message.created_at)) {
              logger.debug(
                `[followup] Customer ${message.from_user_id} responded after message ${message.id}, skipping`
              );
              continue;
            }

            // Skip if they clicked ANY link from this exchange.
            if (await hasAnyLinkBeenClicked(linkIds)) continue;

            // One follow-up per conversation. A conversation is scoped by
            // product: if their recent follow-up chased the same product this
            // exchange is about, it's the same conversation (e.g. they replied
            // "still thinking" to the nudge) — no second nudge. If this
            // exchange is about a DIFFERENT product, it's a genuinely new
            // conversation and gets its own follow-up.
            const chasedProducts = await recentFollowupProducts(shop.id, message.from_user_id);
            if (chasedProducts) {
              const candidateProducts = links.map((l) => l.productId).filter(Boolean);
              const isNewConversation =
                chasedProducts !== "unknown" &&
                candidateProducts.length > 0 &&
                candidateProducts.some((p) => !chasedProducts.has(p));
              if (!isNewConversation) {
                logger.debug(
                  `[followup] Customer ${message.from_user_id} already got a follow-up for this conversation, skipping`
                );
                continue;
              }
            }

            const usageData = await getShopPlanAndUsage(shop.id);
            if (!usageData?.plan) continue;

            if (usageData.usage >= usageData.cap) {
              logger.debug(
                `[followup] Shop ${shop.id} at usage cap (${usageData.usage}/${usageData.cap}), skipping follow-up`
              );
              continue;
            }

            // Atomically claim the follow-up slot. If another tick already
            // claimed (or sent) this one we skip silently.
            claimed = await claimFollowupSlot(shop.id, message.id, claimLinkId);
            if (!claimed) {
              logger.debug(
                `[followup] Already claimed for message ${message.id}, skipping`
              );
              continue;
            }

            // Generate follow-up message (AI-tuned to brand voice when
            // configured; never leaks raw custom_instruction text).
            const brandVoice = await getBrandVoice(shop.id);
            const followupMessage = await generateFollowupMessage(brandVoice);

            await sendDmReply(shop.id, message.from_user_id, followupMessage);

            // Record the follow-up on the triggering message so the analytics
            // message log shows it in the conversation. link_id is stable per
            // message (one follow-up max), url stays null (nothing to click).
            const { error: logFuError } = await supabase.from("links_sent").insert({
              shop_id: shop.id,
              message_id: message.id,
              url: null,
              link_id: `followup_${message.id}`,
              reply_text: followupMessage,
            });
            if (logFuError && logFuError.code !== "23505") {
              console.error("[followup] Error logging follow-up to conversation:", logFuError);
            }

            logger.debug(
              `[followup] ✅ Follow-up sent for message ${message.id} in shop ${shop.id}`
            );
          } catch (error) {
            // If the send failed AFTER we claimed, release the slot so the
            // next hourly tick (still within 23–24h) can retry.
            if (claimed && claimLinkId) {
              await releaseFollowupSlot(shop.id, message.id, claimLinkId);
            }
            logError("processFollowups - message", error, {
              shopId: shop.id,
              messageId: message.id,
            });
          }
        }
      } catch (error) {
        logError("processFollowups - shop", error, { shopId: shop.id });
      }
    }

    logger.debug("[followup] Follow-up processing completed");
  } catch (error) {
    logError("processFollowups", error);
  }
}

/**
 * Generate a follow-up message tailored to the shop's brand voice.
 *
 * IMPORTANT: We never prepend `custom_instruction` to the user-facing text.
 * The instruction is a STYLE directive for the model — it should shape the
 * output, not appear in it.
 */
async function generateFollowupMessage(brandVoice) {
  const tone = brandVoice?.tone || "friendly";
  const customInstruction = (brandVoice?.custom_instruction || "").trim();
  const fallback = FALLBACK_BY_TONE[tone] || FALLBACK_BY_TONE.friendly;

  // No AI client → use canned tone-based fallback (NEVER prepend the
  // custom_instruction; that would leak it to the customer).
  if (!openai) return fallback;

  // No brand voice config worth invoking the model for → canned fallback.
  if (!customInstruction && (!tone || tone === "friendly")) return fallback;

  try {
    const userPrompt = `Generate a brief Instagram DM follow-up check-in to a customer who received a product link from us about 24 hours ago and hasn't clicked it yet.

Requirements:
${customInstruction ? `- CRITICAL STYLE REQUIREMENT: ${customInstruction}. You MUST write in this exact style. This is the most important requirement.` : `- Style: Use a ${tone} tone`}
- This is a soft check-in, NOT a sales push
- Do NOT include any link, URL, or product name
- Do NOT introduce yourself or the business
- Do NOT make up information (no prices, policies, or product details)
- Keep it 1-2 sentences max
- Plain text only — no markdown
- Do NOT echo or reference the style instruction itself in the output

Write the message:`;

    const systemMessage = customInstruction
      ? `You are an assistant that writes short Instagram DM follow-up messages. Follow the custom style instruction exactly — it is the most important requirement. Never include the style instruction text itself in your output. Do not default to being friendly or helpful unless the instruction explicitly says so.`
      : `You are a helpful assistant that writes brief, warm follow-up messages on Instagram DMs. Keep responses short and natural.`;

    const completion = await openai.chat.completions.create(completionParamsForModel(REPLY_MODEL, {
      model: REPLY_MODEL,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 100,
      temperature: 0.7,
    }));

    const aiMessage = completion?.choices?.[0]?.message?.content?.trim();
    if (aiMessage) return aiMessage;
  } catch (err) {
    console.error(
      "[followup] Error generating AI followup message:",
      err?.message || err
    );
  }

  // AI failed → safe canned fallback (still no instruction leak).
  return fallback;
}
