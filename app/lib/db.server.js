import supabase from "./supabase.server";
import { encryptToken, decryptToken } from "./crypto.server";
import { getPlanConfig } from "./plans";
import logger from "./logger.server";


export async function getShopByDomain(shopifyDomain) {
  const { data, error } = await supabase
    .from("shops")
    .select("*")
    .eq("shopify_domain", shopifyDomain)
    .single();

  if (error) {
    // PGRST116 = "no rows returned" (expected when shop doesn't exist)
    // Also check for message in case error codes change
    if (error.code !== "PGRST116" && !error.message?.includes("No rows found")) {
      console.error("getShopByDomain error", error);
    }
  }
  return data || null;
}

/**
 * If the shop's usage_month is before the current month, reset usage to 0 and set usage_month to current month.
 * This ensures the UI shows 0/limit at the start of each month without waiting for the first message.
 * Returns the updated shop row (or the same shop if no reset needed).
 */
export async function ensureUsageMonthCurrent(shop) {
  if (!shop?.id) return shop;
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentMonthStr = currentMonthStart.toISOString().slice(0, 10);
  const usageMonthRaw = shop.usage_month;
  const usageMonthStr =
    typeof usageMonthRaw === "string"
      ? usageMonthRaw.slice(0, 10)
      : usageMonthRaw
        ? new Date(usageMonthRaw).toISOString().slice(0, 10)
        : null;
  if (!usageMonthStr || usageMonthStr < currentMonthStr) {
    const { data, error } = await supabase
      .from("shops")
      .update({
        usage_count: 0,
        usage_month: currentMonthStr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shop.id)
      .select("*")
      .single();
    if (!error && data) return data;
  }
  return shop;
}

export async function createOrUpdateShop(shopifyDomain, defaults = {}) {
  // Create usage_month in UTC (first day of current month)
  const now = new Date();
  const usageMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();

  // Base defaults - these are the initial values for a new shop
  const baseDefaults = {
    plan: "FREE",
    monthly_cap: 100,
    usage_month: usageMonth,
    usage_count: 0, // Always start at 0 on install/reinstall
    priority_support: false,
    active: true, // Always set to true on install/reinstall
  };

  // Merge defaults, but ensure active and usage_count are explicitly set
  // This ensures that on reinstall, active is set to true and usage_count is reset to 0
  const shopData = {
    ...baseDefaults,
    ...defaults,
    shopify_domain: shopifyDomain,
    // Explicitly override these to ensure they're set correctly on install/reinstall
    active: defaults.active !== undefined ? defaults.active : true,
    usage_count: defaults.usage_count !== undefined ? defaults.usage_count : 0,
  };

  // Check if shop already exists
  const existing = await getShopByDomain(shopifyDomain);

  if (existing) {
    // Shop exists - do an explicit UPDATE to ensure all fields are updated
    logger.debug(`Updating existing shop ${shopifyDomain} with active=${shopData.active}, usage_count=${shopData.usage_count}`);
    const { data, error } = await supabase
      .from("shops")
      .update({
        plan: shopData.plan,
        monthly_cap: shopData.monthly_cap,
        usage_month: shopData.usage_month,
        usage_count: shopData.usage_count, // Explicitly reset to 0 on reinstall
        priority_support: shopData.priority_support,
        active: shopData.active, // Explicitly set to true on reinstall
      })
      .eq("shopify_domain", shopifyDomain)
      .select("*")
      .single();

    if (error) {
      console.error("createOrUpdateShop update error", error);
      throw error;
    }

    logger.debug(`Shop ${shopifyDomain} updated successfully: active=${data.active}, usage_count=${data.usage_count}`);
    return data;
  } else {
    // Shop doesn't exist - do an INSERT
    logger.debug(`Creating new shop ${shopifyDomain} with active=${shopData.active}, usage_count=${shopData.usage_count}`);
    const { data, error } = await supabase
      .from("shops")
      .insert(shopData)
      .select("*")
      .single();

    if (error) {
      console.error("createOrUpdateShop insert error", error);
      throw error;
    }

    logger.debug(`Shop ${shopifyDomain} created successfully: active=${data.active}, usage_count=${data.usage_count}`);
    return data;
  }
}

export async function updateShopPlan(shopId, plan) {
  const config = getPlanConfig(plan);

  const { error } = await supabase
    .from("shops")
    .update({
      plan,
      monthly_cap: config.cap,
      priority_support: config.prioritySupport,
    })
    .eq("id", shopId);

  if (error) {
    console.error("updateShopPlan error", error);
    throw error;
  }
}

/**
 * Increment usage, resetting month if needed.
 */
export async function incrementUsage(shopId, delta) {
  const { error } = await supabase.rpc("increment_usage", {
    p_shop_id: shopId,
    p_delta: delta,
  });

  if (error) {
    console.error("incrementUsage rpc error", error);
    throw error;
  }
}

export async function getShopPlanAndUsage(shopId) {
  const { data, error } = await supabase
    .from("shops")
    .select("plan, usage_month, usage_count, monthly_cap, beta_trial_expires_at")
    .eq("id", shopId)
    .single();

  if (error) {
    console.error("getShopPlanAndUsage error", error);
    throw error;
  }

  const isBetaActive = data.beta_trial_expires_at &&
    new Date(data.beta_trial_expires_at) > new Date();
  const planConfig = isBetaActive ? getPlanConfig("PRO") : getPlanConfig(data.plan);

  return {
    plan: planConfig,
    usage: data.usage_count,
    cap: isBetaActive ? planConfig.cap : data.monthly_cap,
  };
}

/**
 * Store Meta (FB/IG) tokens encrypted.
 */
export async function saveMetaAuth(params) {
  const {
    shopId,
    pageId,
    igBusinessId,
    userToken,
    pageToken,
    igToken,
    tokenExpiresAt,
  } = params;

  const { error } = await supabase.from("meta_auth").upsert(
    {
      shop_id: shopId,
      page_id: pageId,
      ig_business_id: igBusinessId,
      user_token_enc: encryptToken(userToken),
      page_token_enc: encryptToken(pageToken),
      ig_token_enc: encryptToken(igToken),
      token_expires_at: tokenExpiresAt || null,
    },
    {
      onConflict: "shop_id",
    }
  );

  if (error) {
    console.error("saveMetaAuth error", error);
    throw error;
  }
}

export async function getMetaAuth(shopId) {
  const { data, error } = await supabase
    .from("meta_auth")
    .select("*")
    .eq("shop_id", shopId)
    .single();

  if (error) {
    console.error("getMetaAuth error", error);
    return null;
  }

  return {
    ...data,
    user_token: data.user_token_enc ? decryptToken(data.user_token_enc) : null,
    page_token: data.page_token_enc ? decryptToken(data.page_token_enc) : null,
    ig_token: data.ig_token_enc ? decryptToken(data.ig_token_enc) : null,
  };
}

/**
 * Log incoming messages (DM or comment).
 */
export async function logMessage(params) {
  const {
    shopId,
    channel,
    externalId,
    fromUserId,
    fromUsername,
    text,
    aiIntent,
    aiConfidence,
    sentiment,
    lastUserMessageAt,
  } = params;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      shop_id: shopId,
      channel,
      external_id: externalId,
      from_user_id: fromUserId || null,
      from_username: fromUsername || null,
      text: text || null,
      ai_intent: aiIntent || null,
      ai_confidence: aiConfidence ?? null,
      sentiment: sentiment || null,
      last_user_message_at: lastUserMessageAt || null,
    })
    .select("*")
    .single();

  if (error) {
    // Idempotency: if unique violation, fetch existing row
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .eq("shop_id", shopId)
        .eq("external_id", externalId)
        .single();

      if (fetchError) {
        console.error("logMessage fetch existing error", fetchError);
        throw fetchError;
      }
      return existing;
    }

    console.error("logMessage insert error", error);
    throw error;
  }

  return data;
}

/**
 * Update AI fields for a message.
 */
export async function updateMessageAI(
  messageId,
  aiIntent,
  aiConfidence,
  sentiment
) {
  const { error } = await supabase
    .from("messages")
    .update({
      ai_intent: aiIntent,
      ai_confidence: aiConfidence,
      sentiment,
    })
    .eq("id", messageId);

  if (error) {
    console.error("updateMessageAI error", error);
    throw error;
  }
}

/**
 * Record a sent link.
 */
/**
 * Returns true if we have already sent an automated reply for this message (one reply per message for Meta compliance).
 */
export async function alreadyRepliedToMessage(messageId) {
  if (!messageId) return false;
  const { data, error } = await supabase
    .from("links_sent")
    .select("id")
    .eq("message_id", messageId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[db] alreadyRepliedToMessage error:", error.message);
    return false;
  }
  return !!data;
}

/**
 * Returns true if we have already sent an automated reply for this external message ID.
 * Uses link_id = dm_reply_ext_{externalId} to dedupe across duplicate message rows.
 */
export async function alreadyRepliedToExternalMessage(shopId, externalId) {
  if (!shopId || !externalId) return false;
  const linkId = `dm_reply_ext_${externalId}`;
  const { data, error } = await supabase
    .from("links_sent")
    .select("id")
    .eq("shop_id", shopId)
    .eq("link_id", linkId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[db] alreadyRepliedToExternalMessage error:", error.message);
    return false;
  }
  return !!data;
}

/**
 * Returns true if we have already sent an automated DM reply for this Instagram comment (by external_id).
 * Used by webhook to skip classification + automation when we already replied (stops API loop).
 */
export async function alreadyRepliedToComment(shopId, commentExternalId) {
  if (!shopId || !commentExternalId) return false;
  const linkId = `dm_reply_comment_${commentExternalId}`;
  const { data, error } = await supabase
    .from("links_sent")
    .select("id")
    .eq("shop_id", shopId)
    .eq("link_id", linkId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[db] alreadyRepliedToComment error:", error.message);
    return false;
  }
  return !!data;
}

/**
 * Claim the right to send the one automated reply for this message (atomic). Returns true if we claimed, false if already claimed.
 * Uses link_id = dm_reply_${messageId} so duplicate webhook processing only one wins.
 */
export async function claimMessageReply(shopId, messageId, replyText, externalId = null) {
  if (!shopId || !messageId) return false;
  const stableId = externalId || messageId;
  const linkId = `dm_reply_ext_${stableId}`;
  const { error } = await supabase.from("links_sent").insert({
    shop_id: shopId,
    message_id: messageId,
    product_id: null,
    variant_id: null,
    url: null,
    link_id: linkId,
    reply_text: replyText || null,
  });
  if (error) {
    if (error.code === "23505") return false; // unique violation, already claimed
    console.warn("[db] claimMessageReply error:", error.message);
    return false;
  }
  return true;
}

/**
 * Claim the right to send the one automated DM reply for this Instagram comment (atomic).
 * Uses link_id = dm_reply_comment_${commentExternalId} so only one reply is sent per comment
 * even if the webhook is delivered multiple times or multiple message rows exist for the same comment.
 */
export async function claimCommentReply(shopId, commentExternalId, replyText, messageId) {
  if (!shopId || !commentExternalId) return false;
  const linkId = `dm_reply_comment_${commentExternalId}`;
  const { error } = await supabase.from("links_sent").insert({
    shop_id: shopId,
    message_id: messageId || null,
    product_id: null,
    variant_id: null,
    url: null,
    link_id: linkId,
    reply_text: replyText || null,
  });
  if (error) {
    if (error.code === "23505") return false; // unique violation, already claimed
    console.warn("[db] claimCommentReply error:", error.message);
    return false;
  }
  return true;
}

export async function logLinkSent(params) {
  const { shopId, messageId, productId, variantId, url, linkId, replyText } = params;

  const { data, error } = await supabase
    .from("links_sent")
    .insert({
      shop_id: shopId,
      message_id: messageId || null,
      product_id: productId || null,
      variant_id: variantId || null,
      url,
      link_id: linkId,
      reply_text: replyText || null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      // if linkId already exists, just fetch it
      const { data: existing, error: fetchError } = await supabase
        .from("links_sent")
        .select("*")
        .eq("link_id", linkId)
        .single();
      if (fetchError) {
        console.error("logLinkSent fetch existing error", fetchError);
        throw fetchError;
      }
      return existing;
    }

    console.error("logLinkSent error", error);
    throw error;
  }

  return data;
}

/**
 * Fetch recent inbound messages and related outbound replies/links for a specific IG user.
 * Used to provide light "thread context" for conversation replies (e.g. after follow-ups).
 */
export async function getRecentConversationContext(shopId, fromUserId, options = {}) {
  const windowHours = options.windowHours ?? 24;
  const maxMessages = options.maxMessages ?? 25;
  const maxLinks = options.maxLinks ?? 25;

  if (!shopId || !fromUserId) {
    return {
      windowStartIso: null,
      messages: [],
      linksSent: [],
      lastOutbound: null,
      lastProductLink: null,
      originChannel: null,
    };
  }

  const windowStartIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  // 1) Recent inbound messages for this user
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, channel, text, created_at, ai_intent, ai_confidence, sentiment")
    .eq("shop_id", shopId)
    .eq("from_user_id", fromUserId)
    .gte("created_at", windowStartIso)
    .order("created_at", { ascending: false })
    .limit(maxMessages);

  if (messagesError) {
    console.error("[context] Error fetching recent messages:", messagesError);
    return {
      windowStartIso,
      messages: [],
      linksSent: [],
      lastOutbound: null,
      lastProductLink: null,
      originChannel: null,
    };
  }

  const messageIds = (messages || []).map((m) => m.id).filter(Boolean);
  const messageById = new Map((messages || []).map((m) => [m.id, m]));

  // 2) Outbound replies/links associated with those messages
  let linksSent = [];
  if (messageIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("links_sent")
      .select("id, message_id, product_id, variant_id, url, link_id, reply_text, sent_at")
      .eq("shop_id", shopId)
      .in("message_id", messageIds)
      .order("sent_at", { ascending: false })
      .limit(maxLinks);

    if (linksError) {
      console.error("[context] Error fetching recent links_sent:", linksError);
    } else {
      linksSent = links || [];
    }
  }

  // Enrich with the trigger channel (comment vs dm)
  const enrichedLinks = (linksSent || []).map((l) => ({
    ...l,
    trigger_channel: messageById.get(l.message_id)?.channel || null,
  }));

  // Most recent outbound row (may be a clarifying question with url=null)
  const lastOutbound = enrichedLinks.length > 0 ? enrichedLinks[0] : null;

  // Most recent outbound row that contains product context (from comment->DM mapping or an earlier contextual reply)
  const lastProductLink =
    enrichedLinks.find((l) => l.product_id && (l.url || l.link_id)) || null;

  const originChannel =
    lastProductLink?.trigger_channel || lastOutbound?.trigger_channel || null;

  return {
    windowStartIso,
    messages: messages || [],
    linksSent: enrichedLinks,
    lastOutbound,
    lastProductLink,
    originChannel,
  };
}

/**
 * Record a click on a link_id (string from URL).
 */
export async function logClick(params) {
  const { linkId, userAgent, ip } = params;

  const { error } = await supabase.from("clicks").insert({
    link_id: linkId,
    user_agent: userAgent || null,
    ip: ip || null,
  });

  if (error) {
    console.error("logClick error", error);
    throw error;
  }
}

/**
 * Record order attribution.
 */
export async function recordAttribution(params) {
  const { shopId, orderId, linkId, channel, amount, currency } = params;

  const { error } = await supabase.from("attribution").insert({
    shop_id: shopId,
    order_id: orderId,
    link_id: linkId || null,
    channel: channel || null,
    amount: amount ?? null,
    currency: currency || "USD",
  });

  if (error) {
    console.error("recordAttribution error", error);
    throw error;
  }
}

/**
 * Get attribution records for a shop with optional filters
 * @param {string} shopId - The shop ID
 * @param {Object} filters - Optional filters: { channel, orderId, startDate, endDate, limit }
 * @returns {Promise<Array>} Array of attribution records
 */
export async function getAttributionRecords(shopId, filters = {}) {
  const { channel, orderId, startDate, limit = 50, linkIds = null } = filters;
  const endDate = filters.endDate && !filters.endDate.includes("T")
    ? `${filters.endDate}T23:59:59.999Z`
    : filters.endDate;

  let query = supabase
    .from("attribution")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (linkIds) {
    query = query.in("link_id", linkIds.length > 0 ? linkIds : ["__none__"]);
  }

  if (channel) {
    query = query.eq("channel", channel);
  }

  if (orderId) {
    query = query.eq("order_id", orderId);
  }

  if (startDate) {
    query = query.gte("created_at", startDate);
  }

  if (endDate) {
    query = query.lte("created_at", endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getAttributionRecords error", error);
    throw error;
  }

  return data || [];
}

/**
 * Get settings for a shop.
 */
/**
 * @param {string} shopId
 * @param {string} [planName] - Optional plan name already known by the caller (skips an extra DB read).
 */
export async function getSettings(shopId, planName) {
  // Only query the shop for its plan when the caller hasn't provided it
  let plan = planName || null;
  if (!plan) {
    const { data: shop } = await supabase
      .from("shops")
      .select("plan")
      .eq("id", shopId)
      .single();
    plan = shop?.plan || "FREE";
  }

  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("shop_id", shopId)
    .single();

  if (error) {
    // PGRST116 = "no rows returned" (expected when settings don't exist)
    if (error.code === "PGRST116" || error.message?.includes("No rows found")) {
      // Return default settings if none exist, based on plan
      return {
        shop_id: shopId,
        dm_automation_enabled: true,
        comment_automation_enabled: plan === "PRO" ? true : false,
        followup_enabled: false, // Only PRO can enable, defaults to false
        enabled_post_ids: null,
      };
    }
    console.error("getSettings error", error);
    throw error;
  }

  // Enforce plan restrictions: FREE/GROWTH can use DM automation (with cap); only PRO gets comments + followup
  if (plan === "FREE") {
    data.comment_automation_enabled = false;
    data.followup_enabled = false;
  } else if (plan === "GROWTH") {
    data.followup_enabled = false;
  }
  // dm_automation_enabled: allow for FREE and GROWTH so they get replies within their plan cap

  return data;
}

/**
 * Update settings for a shop.
 */
/**
 * @param {string} shopId
 * @param {Object} settings
 * @param {string} [planName] - Optional plan name already known by the caller (skips an extra DB read).
 */
export async function updateSettings(shopId, settings, planName) {
  let plan = planName || null;
  if (!plan) {
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("plan")
      .eq("id", shopId)
      .single();
    if (shopError) {
      console.error("updateSettings: Could not fetch shop", shopError);
      throw shopError;
    }
    plan = shop?.plan || "FREE";
  }
  const planConfig = getPlanConfig(plan);

  // Enforce plan restrictions: FREE/GROWTH can use DM automation; only PRO gets comments + followup
  let dmAutomationEnabled = settings.dm_automation_enabled;
  let commentAutomationEnabled = settings.comment_automation_enabled;
  let followupEnabled = settings.followup_enabled;

  if (plan === "FREE") {
    commentAutomationEnabled = false;
    followupEnabled = false;
  } else if (plan === "GROWTH") {
    followupEnabled = false;
  }
  // dm_automation_enabled: allow for FREE and GROWTH (saved as-is)

  const { data, error } = await supabase
    .from("settings")
    .upsert(
      {
        shop_id: shopId,
        dm_automation_enabled: dmAutomationEnabled ?? false,
        comment_automation_enabled: commentAutomationEnabled ?? false,
        followup_enabled: followupEnabled ?? false,
        enabled_post_ids: settings.enabled_post_ids || null,
      },
      {
        onConflict: "shop_id",
      }
    )
    .select("*")
    .single();

  if (error) {
    console.error("updateSettings error", error);
    throw error;
  }

  return data;
}

/**
 * Get messages for a shop with optional filters
 */
export async function getMessages(shopId, options = {}) {
  const {
    channel = null,
    limit = 50,
    offset = 0,
    startDate = null,
    endDate = null,
    orderBy = "created_at",
    orderDirection = "desc",
    messageIds = null,
  } = options;

  let query = supabase
    .from("messages")
    .select(`
      *,
      links_sent (
        id,
        link_id,
        sent_at,
        reply_text
      )
    `)
    .eq("shop_id", shopId);

  if (messageIds) {
    query = query.in("id", messageIds.length > 0 ? messageIds : ["__none__"]);
  }

  if (channel) {
    query = query.eq("channel", channel);
  }

  if (startDate) {
    query = query.gte("created_at", startDate);
  }

  if (endDate) {
    query = query.lte("created_at", endDate);
  }

  // Apply ordering
  query = query.order(orderBy, { ascending: orderDirection === "asc" });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error("getMessages error", error);
    throw error;
  }

  // Transform data to include AI response info
  const messages = (data || []).map((message) => {
    const linksSent = message.links_sent || [];
    const aiResponded = linksSent.length > 0;
    const latestResponse = linksSent.length > 0 
      ? linksSent.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0]
      : null;

    return {
      ...message,
      ai_responded: aiResponded,
      ai_response_sent_at: latestResponse?.sent_at || null,
      ai_response_link_id: latestResponse?.link_id || null,
      ai_response_text: latestResponse?.reply_text || null,
      links_sent: undefined, // Remove the nested array from response
    };
  });

  return messages;
}

/**
 * Get message count for a shop (for pagination)
 */
export async function getMessageCount(shopId, options = {}) {
  const { channel = null, startDate = null, endDate = null, messageIds = null } = options;

  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);

  if (messageIds) {
    query = query.in("id", messageIds.length > 0 ? messageIds : ["__none__"]);
  }

  if (channel) {
    query = query.eq("channel", channel);
  }

  if (startDate) {
    query = query.gte("created_at", startDate);
  }

  if (endDate) {
    query = query.lte("created_at", endDate);
  }

  const { count, error } = await query;

  if (error) {
    console.error("getMessageCount error", error);
    throw error;
  }

  return count || 0;
}

/**
 * Count comment messages this month for Free-tier shops (no comment automation).
 * Used to show Free users how many comments they received but couldn't auto-reply to.
 */
export async function getMissedCommentCount(shopId) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("channel", "comment")
    .gte("created_at", monthStart);

  if (error) {
    console.error("getMissedCommentCount error", error);
    return 0;
  }

  return count || 0;
}

/**
 * Get product mapping for an Instagram media ID
 */
export async function getProductMapping(shopId, igMediaId) {
  const { data, error } = await supabase
    .from("post_product_map")
    .select("*")
    .eq("shop_id", shopId)
    .eq("ig_media_id", igMediaId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("[db] Error fetching product mapping:", error);
    throw error;
  }

  return data;
}

/**
 * Get all product mappings for a shop
 */
export async function getProductMappings(shopId) {
  const { data, error } = await supabase
    .from("post_product_map")
    .select("*")
    .eq("shop_id", shopId);

  if (error) {
    console.error("[db] Error fetching product mappings:", error);
    throw error;
  }

  return data || [];
}

/**
 * Save or update product mapping
 * Ensures only one mapping exists per (shop_id, ig_media_id) combination.
 * productHandle is stored so PDP URLs can be built without calling Shopify at runtime.
 */
export async function saveProductMapping(shopId, igMediaId, productId, variantId = null, productHandle = null) {
  // First, delete any existing duplicates for this shop_id + ig_media_id combination
  // This ensures we don't have multiple rows for the same mapping
  const { error: deleteError } = await supabase
    .from("post_product_map")
    .delete()
    .eq("shop_id", shopId)
    .eq("ig_media_id", igMediaId);

  if (deleteError) {
    console.error("[db] Error deleting duplicate mappings:", deleteError);
    // Continue anyway - we'll try to insert/update
  }

  // Now check if a mapping exists (should be at most one after cleanup)
  const { data: existing } = await supabase
    .from("post_product_map")
    .select("*")
    .eq("shop_id", shopId)
    .eq("ig_media_id", igMediaId)
    .maybeSingle();

  // Ensure variant_id is never null - log warning if it is
  if (!variantId) {
    console.warn(`[saveProductMapping] Warning: variant_id is null for product ${productId}, shop ${shopId}, media ${igMediaId}`);
  }

  const mappingData = {
    shop_id: shopId,
    ig_media_id: igMediaId,
    product_id: productId,
    variant_id: variantId, // This should never be null - if it is, there's a bug upstream
    product_handle: (productHandle && String(productHandle).trim()) || null,
  };

  let data, error;

  if (existing) {
    // Update existing mapping
    const { data: updated, error: updateError } = await supabase
      .from("post_product_map")
      .update(mappingData)
      .eq("id", existing.id)
      .select()
      .single();

    data = updated;
    error = updateError;
  } else {
    // Insert new mapping
    const { data: inserted, error: insertError } = await supabase
      .from("post_product_map")
      .insert(mappingData)
      .select()
      .single();

    data = inserted;
    error = insertError;
  }

  if (error) {
    console.error("[db] Error saving product mapping:", error);
    throw error;
  }

  return data;
}

/**
 * Delete product mapping
 * Deletes ALL mappings for the given shop_id and ig_media_id (handles duplicates)
 */
export async function deleteProductMapping(shopId, igMediaId) {
  const { error } = await supabase
    .from("post_product_map")
    .delete()
    .eq("shop_id", shopId)
    .eq("ig_media_id", igMediaId);

  if (error) {
    console.error("[db] Error deleting product mapping:", error);
    throw error;
  }

  return true;
}

/**
 * Update product mappings that have null variant_id by fetching the first variant from Shopify
 * This fixes existing mappings that were created before the auto-fetch logic was added
 */
export async function updateNullVariantMappings(shopId, shopDomain) {
  try {
    // Get all mappings with null variant_id
    const { data: mappings, error: fetchError } = await supabase
      .from("post_product_map")
      .select("*")
      .eq("shop_id", shopId)
      .is("variant_id", null);

    if (fetchError) {
      console.error("[db] Error fetching null variant mappings:", fetchError);
      return { updated: 0, error: fetchError };
    }

    if (!mappings || mappings.length === 0) {
      return { updated: 0 };
    }

    logger.debug(`[db] Found ${mappings.length} mappings with null variant_id, attempting to update...`);

    // Note: This function requires Shopify admin access, which we don't have here
    // The caller should handle fetching variants and updating
    return { mappings, updated: 0 };
  } catch (error) {
    console.error("[db] Error in updateNullVariantMappings:", error);
    return { updated: 0, error };
  }
}

/**
 * Clean up duplicate product mappings for a shop
 * Removes all duplicates, keeping only the most recent one for each (shop_id, ig_media_id) combination
 */
export async function cleanupDuplicateProductMappings(shopId) {
  try {
    // Get all mappings for this shop
    const { data: allMappings, error: fetchError } = await supabase
      .from("post_product_map")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("[db] Error fetching mappings for cleanup:", fetchError);
      return { cleaned: 0, error: fetchError };
    }

    if (!allMappings || allMappings.length === 0) {
      return { cleaned: 0 };
    }

    // Group by ig_media_id and keep only the first (most recent) one
    const seen = new Map();
    const toDelete = [];

    for (const mapping of allMappings) {
      const key = mapping.ig_media_id;
      if (seen.has(key)) {
        // This is a duplicate - mark for deletion
        toDelete.push(mapping.id);
      } else {
        // First occurrence - keep it
        seen.set(key, mapping.id);
      }
    }

    if (toDelete.length === 0) {
      return { cleaned: 0 };
    }

    // Delete duplicates
    const { error: deleteError } = await supabase
      .from("post_product_map")
      .delete()
      .in("id", toDelete);

    if (deleteError) {
      console.error("[db] Error deleting duplicates:", deleteError);
      return { cleaned: 0, error: deleteError };
    }

    logger.debug(`[db] Cleaned up ${toDelete.length} duplicate product mapping(s) for shop ${shopId}`);
    return { cleaned: toDelete.length };
  } catch (error) {
    console.error("[db] Error in cleanupDuplicateProductMappings:", error);
    return { cleaned: 0, error };
  }
}

/**
 * Get brand voice for a shop
 * Always uses 'both' channel (applies to all channels: DM and comments)
 */
export async function getBrandVoice(shopId) {
  const { data, error } = await supabase
    .from("brand_voice")
    .select("*")
    .eq("shop_id", shopId)
    .eq("channel", "both")
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("getBrandVoice error", error);
    throw error;
  }

  return data || null;
}

/**
 * Update or create brand voice for a shop
 * Uses 'both' channel so it applies to all channels (dm, comment, both)
 */
export async function updateBrandVoice(shopId, brandVoice) {
  // First, check if a record exists for this shop_id and channel='both'
  const { data: existing, error: checkError } = await supabase
    .from("brand_voice")
    .select("id")
    .eq("shop_id", shopId)
    .eq("channel", "both")
    .maybeSingle();

  if (checkError && checkError.code !== "PGRST116") {
    console.error("updateBrandVoice check error", checkError);
    throw checkError;
  }

  const updateData = {
    shop_id: shopId,
    channel: "both", // Use 'both' so it applies to all channels
    tone: brandVoice.tone || "friendly",
    custom_instruction: brandVoice.custom_instruction || null,
  };

  let result;
  if (existing) {
    // Update existing record
    const { data, error } = await supabase
      .from("brand_voice")
      .update(updateData)
      .eq("shop_id", shopId)
      .eq("channel", "both")
      .select()
      .single();
    
    if (error) {
      console.error("updateBrandVoice update error", error);
      throw error;
    }
    result = data;
  } else {
    // Insert new record
    const { data, error } = await supabase
      .from("brand_voice")
      .insert(updateData)
      .select()
      .single();
    
    if (error) {
      console.error("updateBrandVoice insert error", error);
      throw error;
    }
    result = data;
  }

  return result;
}

/**
 * Get analytics data for a shop
 * Returns metrics based on plan tier
 */
export async function getAnalytics(shopId, planName, options = {}) {
  const { startDate, productId = null } = options;
  const endDate = options.endDate && !options.endDate.includes("T")
    ? `${options.endDate}T23:59:59.999Z`
    : options.endDate;
  
  const analytics = {
    messagesReceived: 0,
    linksSent: 0,
    clicks: 0,
    ctr: 0,
    responseRate: 0,
    topTriggerPhrases: [],
    channelPerformance: {
      dm: { sent: 0, responded: 0, clicks: 0 },
      comment: { sent: 0, responded: 0, clicks: 0 },
    },
    topPosts: [],
  };

  try {
    // Get links_sent first (may be narrowed by productId)
    let linksQuery = supabase
      .from("links_sent")
      .select("id, message_id, link_id, product_id")
      .eq("shop_id", shopId);

    if (productId) {
      linksQuery = linksQuery.eq("product_id", productId);
    }
    if (startDate) {
      linksQuery = linksQuery.gte("created_at", startDate);
    }
    if (endDate) {
      linksQuery = linksQuery.lte("created_at", endDate);
    }

    const { data: linksSent, error: linksError } = await linksQuery;

    if (linksError) {
      console.error("[analytics] Error fetching links sent:", linksError);
    }

    // When filtering by post, scope messages to those with matching links
    const postFilterMessageIds = productId
      ? [...new Set((linksSent || []).map(l => l.message_id).filter(Boolean))]
      : null;

    let messagesQuery = supabase
      .from("messages")
      .select("id, channel, ai_intent, last_user_message_at, created_at")
      .eq("shop_id", shopId);

    if (postFilterMessageIds) {
      messagesQuery = messagesQuery.in("id", postFilterMessageIds.length > 0 ? postFilterMessageIds : ["__none__"]);
    }
    if (startDate) {
      messagesQuery = messagesQuery.gte("created_at", startDate);
    }
    if (endDate) {
      messagesQuery = messagesQuery.lte("created_at", endDate);
    }

    const { data: allMessages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error("[analytics] Error fetching messages:", messagesError);
      return analytics;
    }

    analytics.messagesReceived = (allMessages || []).length;

    if (linksError) {
      console.error("[analytics] Error fetching links sent:", linksError);
    }

    // Count all links sent
    analytics.linksSent = (linksSent || []).length;

    // Create map of message_id -> link_id, keeping the most recent link per message
    const messageToLink = {};
    const linkIdToChannel = {};
    const linkIds = [];
    (linksSent || []).forEach(link => {
      if (link.message_id) {
        const prev = messageToLink[link.message_id];
        if (!prev || String(link.id) > String(prev.rowId)) {
          messageToLink[link.message_id] = { linkId: link.link_id, rowId: link.id };
        }
        const message = (allMessages || []).find(m => m.id === link.message_id);
        if (message && link.link_id) {
          linkIdToChannel[link.link_id] = message.channel;
        }
      }
      if (link.link_id) {
        linkIds.push(link.link_id);
      }
    });
    const messageToLinkId = {};
    for (const [msgId, val] of Object.entries(messageToLink)) {
      messageToLinkId[msgId] = val.linkId;
    }

    // Filter messages that have links sent (for channel performance and trigger phrases)
    const messagesWithLinks = (allMessages || []).filter(m => messageToLinkId[m.id]);

    // Response rate: % of messages that received an AI response (link sent)
    if (analytics.messagesReceived > 0) {
      analytics.responseRate = (messagesWithLinks.length / analytics.messagesReceived) * 100;
    }

    // Get clicks for ALL link_ids (not just those linked to messages)
    if (linkIds.length > 0) {
      let clicksQuery = supabase
        .from("clicks")
        .select("id, link_id", { count: "exact" })
        .in("link_id", linkIds);

      const { count: clicksCount, error: clicksError } = await clicksQuery;

      if (!clicksError && clicksCount !== null) {
        analytics.clicks = clicksCount;
      }
    }

    // Calculate CTR
    if (analytics.linksSent > 0) {
      analytics.ctr = (analytics.clicks / analytics.linksSent) * 100;
    }

    // Top trigger phrases (group by ai_intent)
    const intentCounts = {};
    messagesWithLinks.forEach(msg => {
      if (msg.ai_intent) {
        intentCounts[msg.ai_intent] = (intentCounts[msg.ai_intent] || 0) + 1;
      }
    });
    
    analytics.topTriggerPhrases = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Growth tier: Per channel performance
    if (planName === "GROWTH" || planName === "PRO") {
      const channelStats = {
        dm: { sent: 0, responded: 0, clicks: 0 },
        comment: { sent: 0, responded: 0, clicks: 0 },
      };

      // Count all messages per channel (not just ones with links)
      (allMessages || []).forEach(msg => {
        const channel = msg.channel;
        if (channelStats[channel]) {
          channelStats[channel].sent++;
        }
      });

      // Count responded messages (those with links sent = AI responded)
      messagesWithLinks.forEach(msg => {
        const channel = msg.channel;
        if (channelStats[channel]) {
          channelStats[channel].responded++;
        }
      });

      // Get clicks per channel
      if (linkIds.length > 0) {
        const { data: clicksData, error: clicksError } = await supabase
          .from("clicks")
          .select("link_id")
          .in("link_id", linkIds);

        if (!clicksError && clicksData) {
          // Use the linkIdToChannel map we built earlier
          clicksData.forEach(click => {
            const channel = linkIdToChannel[click.link_id];
            if (channel && channelStats[channel]) {
              channelStats[channel].clicks++;
            }
          });
        }
      }

      analytics.channelPerformance = channelStats;

      // Top IG posts by engagement (simplified - would need media_id from comments)
      // For now, return empty array - will be enhanced when we have comment media_id tracking
      analytics.topPosts = [];
    }
  } catch (error) {
    console.error("[analytics] Error calculating analytics:", error);
  }

  return analytics;
}

/**
 * Get Pro analytics data for a shop
 * Includes customer segments, sentiment analysis, revenue attribution, follow-up performance
 */
export async function getProAnalytics(shopId, options = {}) {
  const { startDate, productId = null } = options;
  const endDate = options.endDate && !options.endDate.includes("T")
    ? `${options.endDate}T23:59:59.999Z`
    : options.endDate;
  
  const proAnalytics = {
    customerSegments: { firstTime: 0, repeat: 0, total: 0 },
    sentimentAnalysis: { positive: 0, neutral: 0, negative: 0, total: 0 },
    revenueAttribution: { total: 0, byChannel: { dm: 0, comment: 0 }, currency: "USD" },
    followUpPerformance: {
      withFollowup: { messages: 0, clicks: 0, revenue: 0, ctr: 0 },
      withoutFollowup: { messages: 0, clicks: 0, revenue: 0, ctr: 0 },
    },
  };

  try {
    // When filtering by post/product, pre-fetch matching message IDs
    let postFilterMessageIds = null;
    if (productId) {
      let pfLinksQ = supabase.from("links_sent").select("message_id").eq("shop_id", shopId).eq("product_id", productId);
      if (startDate) pfLinksQ = pfLinksQ.gte("created_at", startDate);
      if (endDate) pfLinksQ = pfLinksQ.lte("created_at", endDate);
      const { data: pfLinks } = await pfLinksQ;
      postFilterMessageIds = [...new Set((pfLinks || []).map(l => l.message_id).filter(Boolean))];
    }

    let messagesQuery = supabase
      .from("messages")
      .select("*")
      .eq("shop_id", shopId);

    if (postFilterMessageIds) {
      messagesQuery = messagesQuery.in("id", postFilterMessageIds.length > 0 ? postFilterMessageIds : ["__none__"]);
    }
    if (startDate) {
      messagesQuery = messagesQuery.gte("created_at", startDate);
    }
    if (endDate) {
      messagesQuery = messagesQuery.lte("created_at", endDate);
    }

    const { data: allMessages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error("[pro-analytics] Error fetching messages:", messagesError);
      return proAnalytics;
    }

    if (!allMessages || allMessages.length === 0) {
      return proAnalytics;
    }

    // Customer Segments: Count unique from_user_id interactions
    const userInteractionCounts = {};
    allMessages.forEach(msg => {
      if (msg.from_user_id) {
        userInteractionCounts[msg.from_user_id] = (userInteractionCounts[msg.from_user_id] || 0) + 1;
      }
    });

    Object.values(userInteractionCounts).forEach(count => {
      if (count === 1) {
        proAnalytics.customerSegments.firstTime++;
      } else {
        proAnalytics.customerSegments.repeat++;
      }
    });
    proAnalytics.customerSegments.total = Object.keys(userInteractionCounts).length;

    // Sentiment Analysis: Aggregate sentiment counts
    allMessages.forEach(msg => {
      if (msg.sentiment) {
        const sentiment = msg.sentiment.toLowerCase();
        if (sentiment === "positive" || sentiment.includes("positive")) {
          proAnalytics.sentimentAnalysis.positive++;
        } else if (sentiment === "negative" || sentiment.includes("negative")) {
          proAnalytics.sentimentAnalysis.negative++;
        } else {
          proAnalytics.sentimentAnalysis.neutral++;
        }
        proAnalytics.sentimentAnalysis.total++;
      }
    });

    // Revenue Attribution: Sum revenue from attribution table
    let attributionQuery = supabase
      .from("attribution")
      .select("*")
      .eq("shop_id", shopId);

    if (startDate) {
      attributionQuery = attributionQuery.gte("created_at", startDate);
    }
    if (endDate) {
      attributionQuery = attributionQuery.lte("created_at", endDate);
    }

    const { data: attributions, error: attributionError } = await attributionQuery;

    if (!attributionError && attributions) {
      attributions.forEach(attr => {
        const amount = parseFloat(attr.amount || 0);
        proAnalytics.revenueAttribution.total += amount;
        
        if (attr.channel === "dm") {
          proAnalytics.revenueAttribution.byChannel.dm += amount;
        } else if (attr.channel === "comment") {
          proAnalytics.revenueAttribution.byChannel.comment += amount;
        }

        // Use currency from first attribution (assuming all same currency)
        if (!proAnalytics.revenueAttribution.currency && attr.currency) {
          proAnalytics.revenueAttribution.currency = attr.currency;
        }
      });
    }

    // Follow-Up Performance: Compare threads with vs without follow-ups
    const messageIds = allMessages.map(m => m.id);
    
    // Get links_sent for these messages
    const { data: linksSent, error: linksError } = await supabase
      .from("links_sent")
      .select("id, message_id, link_id")
      .eq("shop_id", shopId)
      .in("message_id", messageIds.length > 0 ? messageIds : [null]);

    if (!linksError && linksSent) {
      const linkIds = linksSent.map(l => l.link_id).filter(Boolean);
      const messageToLink = {};
      linksSent.forEach(link => {
        if (link.message_id) {
          const prev = messageToLink[link.message_id];
          if (!prev || String(link.id) > String(prev.rowId)) {
            messageToLink[link.message_id] = { linkId: link.link_id, rowId: link.id };
          }
        }
      });
      const messageToLinkId = {};
      for (const [msgId, val] of Object.entries(messageToLink)) {
        messageToLinkId[msgId] = val.linkId;
      }

      // Get follow-ups for these messages
      const { data: followups, error: followupsError } = await supabase
        .from("followups")
        .select("message_id, link_id")
        .eq("shop_id", shopId)
        .in("message_id", messageIds);

      if (!followupsError && followups) {
        const messagesWithFollowup = new Set();
        followups.forEach(f => {
          if (f.message_id) {
            messagesWithFollowup.add(f.message_id);
          }
        });

        // Get clicks for these links
        if (linkIds.length > 0) {
          const { data: clicks, error: clicksError } = await supabase
            .from("clicks")
            .select("link_id")
            .in("link_id", linkIds);

          if (!clicksError && clicks) {
            const linkIdToClicks = {};
            clicks.forEach(click => {
              if (click.link_id) {
                linkIdToClicks[click.link_id] = (linkIdToClicks[click.link_id] || 0) + 1;
              }
            });

            // Categorize messages
            allMessages.forEach(msg => {
              const linkId = messageToLinkId[msg.id];
              if (!linkId) return;

              const hasFollowup = messagesWithFollowup.has(msg.id);
              const hasClick = linkIdToClicks[linkId] > 0;

              if (hasFollowup) {
                proAnalytics.followUpPerformance.withFollowup.messages++;
                if (hasClick) {
                  proAnalytics.followUpPerformance.withFollowup.clicks++;
                }
              } else {
                proAnalytics.followUpPerformance.withoutFollowup.messages++;
                if (hasClick) {
                  proAnalytics.followUpPerformance.withoutFollowup.clicks++;
                }
              }
            });

            // Calculate CTR
            if (proAnalytics.followUpPerformance.withFollowup.messages > 0) {
              proAnalytics.followUpPerformance.withFollowup.ctr = 
                (proAnalytics.followUpPerformance.withFollowup.clicks / 
                 proAnalytics.followUpPerformance.withFollowup.messages) * 100;
            }

            if (proAnalytics.followUpPerformance.withoutFollowup.messages > 0) {
              proAnalytics.followUpPerformance.withoutFollowup.ctr = 
                (proAnalytics.followUpPerformance.withoutFollowup.clicks / 
                 proAnalytics.followUpPerformance.withoutFollowup.messages) * 100;
            }

            // Calculate revenue for follow-up vs non-follow-up
            // Match attribution by link_id
            if (attributions) {
              attributions.forEach(attr => {
                if (attr.link_id) {
                  // Find message that has this link_id
                  const messageId = Object.keys(messageToLinkId).find(
                    mid => messageToLinkId[mid] === attr.link_id
                  );
                  
                  if (messageId) {
                    const hasFollowup = messagesWithFollowup.has(messageId);
                    const amount = parseFloat(attr.amount || 0);
                    
                    if (hasFollowup) {
                      proAnalytics.followUpPerformance.withFollowup.revenue += amount;
                    } else {
                      proAnalytics.followUpPerformance.withoutFollowup.revenue += amount;
                    }
                  }
                }
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[pro-analytics] Error calculating Pro analytics:", error);
  }

  return proAnalytics;
}

/**
 * Get all stores with aggregates for admin dashboard.
 * Returns: [{ shop_id, shopify_domain, created_at, active, messages_sent, revenue }]
 */
export async function getAdminDashboardStores() {
  const { data: shops, error: shopsError } = await supabase
    .from("shops")
    .select("id, shopify_domain, active, created_at")
    .order("id", { ascending: true });

  if (shopsError) {
    // If created_at column doesn't exist, retry without it
    if (shopsError.code === "42703" || shopsError.message?.includes("created_at")) {
      const { data: shopsFallback, error: fallbackError } = await supabase
        .from("shops")
        .select("id, shopify_domain, active")
        .order("id", { ascending: true });
      if (fallbackError) {
        console.error("getAdminDashboardStores shops error", fallbackError);
        throw fallbackError;
      }
      const withCreatedAt = (shopsFallback || []).map((s) => ({ ...s, created_at: null }));
      return buildAdminStoresResult(withCreatedAt);
    }
    console.error("getAdminDashboardStores shops error", shopsError);
    throw shopsError;
  }

  return buildAdminStoresResult(shops || []);
}

export async function getOutboundQueueOverview(filters = {}) {
  const { shopId = null, status = null } = filters;

  let query = supabase
    .from("outbound_dm_queue")
    .select("id, status, updated_at");

  if (shopId) {
    query = query.eq("shop_id", shopId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("getOutboundQueueOverview error", error);
    throw error;
  }

  const counts = { pending: 0, processing: 0, sent: 0, failed: 0 };
  let lastUpdatedAt = null;
  (data || []).forEach((row) => {
    if (row.status && counts[row.status] !== undefined) {
      counts[row.status] += 1;
    }
    if (row.updated_at) {
      if (!lastUpdatedAt || new Date(row.updated_at) > new Date(lastUpdatedAt)) {
        lastUpdatedAt = row.updated_at;
      }
    }
  });

  return {
    total: (data || []).length,
    counts,
    lastUpdatedAt,
  };
}

export async function getOutboundQueueItems(filters = {}) {
  const {
    shopId = null,
    status = null,
    limit = 50,
  } = filters;

  let query = supabase
    .from("outbound_dm_queue")
    .select("id, shop_id, ig_user_id, text, status, attempts, not_before, last_error, created_at, updated_at, shops(shopify_domain)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (shopId) {
    query = query.eq("shop_id", shopId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("getOutboundQueueItems error", error);
    throw error;
  }

  return data || [];
}

async function buildAdminStoresResult(shops) {
  const { data: linksRows, error: linksError } = await supabase
    .from("links_sent")
    .select("shop_id");

  if (linksError) {
    console.error("getAdminDashboardStores links_sent error", linksError);
  }

  const { data: attributionRows, error: attrError } = await supabase
    .from("attribution")
    .select("shop_id, amount");

  if (attrError) {
    console.error("getAdminDashboardStores attribution error", attrError);
  }

  const messagesByShop = new Map();
  (linksRows || []).forEach((row) => {
    const id = row.shop_id;
    messagesByShop.set(id, (messagesByShop.get(id) || 0) + 1);
  });

  const revenueByShop = new Map();
  (attributionRows || []).forEach((row) => {
    const id = row.shop_id;
    const amount = parseFloat(row.amount || 0);
    revenueByShop.set(id, (revenueByShop.get(id) || 0) + amount);
  });

  return shops.map((s) => ({
    shop_id: s.id,
    shopify_domain: s.shopify_domain,
    created_at: s.created_at,
    active: s.active,
    messages_sent: messagesByShop.get(s.id) || 0,
    revenue: revenueByShop.get(s.id) || 0,
  }));
}

// ---------------------------------------------------------------------------
// Store context cache (used by DM automation for store_question replies)
// ---------------------------------------------------------------------------

const STORE_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Return the cached store context for a shop, or null if missing / stale.
 * @param {string} shopId
 * @param {number} [ttlMs] - How old (in ms) a cached value can be before it's considered stale.
 *   Defaults to 24 hours. Pass 0 to always return the cached value regardless of age.
 * @returns {Promise<Object|null>}
 */
export async function getStoredStoreContext(shopId, ttlMs = STORE_CONTEXT_TTL_MS) {
  if (!shopId) return null;
  const { data, error } = await supabase
    .from("shops")
    .select("store_context_json, store_context_updated_at")
    .eq("id", shopId)
    .single();
  if (error || !data?.store_context_json) return null;
  if (ttlMs > 0 && data.store_context_updated_at) {
    const age = Date.now() - new Date(data.store_context_updated_at).getTime();
    if (age > ttlMs) return null; // stale — caller should refresh
  }
  return data.store_context_json;
}

/**
 * Persist the store context object returned by getShopifyStoreInfo() onto the shops row.
 * Called in the background from getShopWithPlan whenever the cached value is missing or stale.
 * @param {string} shopId
 * @param {Object} storeInfo - Result of getShopifyStoreInfo()
 */
export async function saveStoredStoreContext(shopId, storeInfo) {
  if (!shopId || !storeInfo) return;
  const { error } = await supabase
    .from("shops")
    .update({
      store_context_json: storeInfo,
      store_context_updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);
  if (error) {
    console.error("[db] saveStoredStoreContext error:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Beta Trial
// ---------------------------------------------------------------------------

/**
 * Save a beta code as "pending" on the shop so it can be auto-redeemed
 * after Shopify billing approval, regardless of where the redirect lands.
 */
export async function setPendingBetaCode(shopId, code) {
  const { error } = await supabase
    .from("shops")
    .update({ pending_beta_code: code.trim().toUpperCase() })
    .eq("id", shopId);
  if (error) console.error("setPendingBetaCode error:", error);
}

/**
 * Check if the shop has a pending beta code and an active Shopify subscription.
 * If both conditions are met, redeem the code and clear the pending state.
 * Meant to run on every page load so the beta activates automatically.
 */
export async function tryRedeemPendingBeta(shopId, admin) {
  const { data: shop } = await supabase
    .from("shops")
    .select("pending_beta_code, beta_trial_expires_at")
    .eq("id", shopId)
    .single();

  if (!shop?.pending_beta_code) return false;

  const alreadyActive = shop.beta_trial_expires_at &&
    new Date(shop.beta_trial_expires_at) > new Date();
  if (alreadyActive) {
    await supabase.from("shops").update({ pending_beta_code: null }).eq("id", shopId);
    return false;
  }

  try {
    const { getCurrentSubscription } = await import("./billing.server.js");
    const subscription = await getCurrentSubscription(admin);
    if (!subscription || subscription.status !== "ACTIVE") return false;
  } catch {
    return false;
  }

  const result = await validateAndRedeemBetaCode(shopId, shop.pending_beta_code);
  if (result.success) {
    await supabase.from("shops").update({ pending_beta_code: null }).eq("id", shopId);
    await updateShopPlan(shopId, "PRO");
  }
  return result.success;
}

/**
 * Validate a beta code WITHOUT redeeming it.
 * Returns { success, trialDays } or { success: false, message }.
 */
export async function validateBetaCode(shopId, code) {
  const trimmed = (code || "").trim().toUpperCase();
  if (!trimmed) return { success: false, message: "No code provided." };

  const { data: betaCode, error: fetchErr } = await supabase
    .from("beta_codes")
    .select("*")
    .eq("code", trimmed)
    .single();

  if (fetchErr || !betaCode) {
    return { success: false, message: "Invalid beta code." };
  }
  if (!betaCode.active) {
    return { success: false, message: "This beta code has been deactivated." };
  }
  if (betaCode.expires_at && new Date(betaCode.expires_at) < new Date()) {
    return { success: false, message: "This beta code has expired." };
  }
  if (betaCode.times_used >= betaCode.max_uses) {
    return { success: false, message: "This beta code has already been fully redeemed." };
  }

  const { data: existing } = await supabase
    .from("beta_redemptions")
    .select("id")
    .eq("beta_code_id", betaCode.id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (existing) {
    return { success: false, message: "You have already redeemed this beta code." };
  }

  return { success: true, trialDays: betaCode.trial_days };
}

/**
 * Validate a beta code and redeem it for a shop.
 * Returns { success, message, trialExpiresAt } or { success: false, message }.
 */
export async function validateAndRedeemBetaCode(shopId, code) {
  const trimmed = (code || "").trim().toUpperCase();
  if (!trimmed) return { success: false, message: "No code provided." };

  const { data: betaCode, error: fetchErr } = await supabase
    .from("beta_codes")
    .select("*")
    .eq("code", trimmed)
    .single();

  if (fetchErr || !betaCode) {
    return { success: false, message: "Invalid beta code." };
  }

  if (!betaCode.active) {
    return { success: false, message: "This beta code has been deactivated." };
  }

  if (betaCode.expires_at && new Date(betaCode.expires_at) < new Date()) {
    return { success: false, message: "This beta code has expired." };
  }

  if (betaCode.times_used >= betaCode.max_uses) {
    return { success: false, message: "This beta code has already been fully redeemed." };
  }

  const { data: existing } = await supabase
    .from("beta_redemptions")
    .select("id")
    .eq("beta_code_id", betaCode.id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (existing) {
    return { success: false, message: "You have already redeemed this beta code." };
  }

  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + betaCode.trial_days);
  const expiresIso = trialExpiresAt.toISOString();

  const { error: redemptionErr } = await supabase
    .from("beta_redemptions")
    .insert({
      beta_code_id: betaCode.id,
      shop_id: shopId,
      trial_expires_at: expiresIso,
    });

  if (redemptionErr) {
    console.error("beta redemption insert error", redemptionErr);
    return { success: false, message: "Failed to redeem code. Please try again." };
  }

  await supabase
    .from("beta_codes")
    .update({ times_used: betaCode.times_used + 1 })
    .eq("id", betaCode.id);

  await supabase
    .from("shops")
    .update({ beta_trial_expires_at: expiresIso })
    .eq("id", shopId);

  return {
    success: true,
    message: `Beta trial activated! You have full PRO access until ${trialExpiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`,
    trialExpiresAt: expiresIso,
  };
}

/**
 * Return beta trial status for a shop (or null if none).
 */
export async function getBetaTrialStatus(shopId) {
  const { data, error } = await supabase
    .from("shops")
    .select("beta_trial_expires_at")
    .eq("id", shopId)
    .single();

  if (error || !data?.beta_trial_expires_at) return null;

  const expires = new Date(data.beta_trial_expires_at);
  const now = new Date();
  const active = expires > now;
  const daysRemaining = active
    ? Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
    : 0;

  return { active, expiresAt: data.beta_trial_expires_at, daysRemaining };
}
