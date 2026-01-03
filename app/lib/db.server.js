import supabase from "./supabase.server";
import { encryptToken, decryptToken } from "./crypto.server";
import { getPlanConfig } from "./plans";


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

export async function createOrUpdateShop(shopifyDomain, defaults = {}) {
  // Create usage_month in UTC (first day of current month)
  const now = new Date();
  const usageMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();

  // Base defaults - these are the initial values for a new shop
  const baseDefaults = {
    plan: "FREE",
    monthly_cap: 25,
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
    console.log(`Updating existing shop ${shopifyDomain} with active=${shopData.active}, usage_count=${shopData.usage_count}`);
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

    console.log(`Shop ${shopifyDomain} updated successfully: active=${data.active}, usage_count=${data.usage_count}`);
    return data;
  } else {
    // Shop doesn't exist - do an INSERT
    console.log(`Creating new shop ${shopifyDomain} with active=${shopData.active}, usage_count=${shopData.usage_count}`);
    const { data, error } = await supabase
      .from("shops")
      .insert(shopData)
      .select("*")
      .single();

    if (error) {
      console.error("createOrUpdateShop insert error", error);
      throw error;
    }

    console.log(`Shop ${shopifyDomain} created successfully: active=${data.active}, usage_count=${data.usage_count}`);
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
  // Fetch current
  const { data, error } = await supabase
    .from("shops")
    .select("usage_month, usage_count")
    .eq("id", shopId)
    .single();

  if (error) {
    console.error("incrementUsage fetch error", error);
    throw error;
  }

  const now = new Date();
  const currMonth = new Date(data.usage_month);
  const isSameMonth =
    currMonth.getUTCFullYear() === now.getUTCFullYear() &&
    currMonth.getUTCMonth() === now.getUTCMonth();

  let usageMonth = currMonth;
  let usageCount = data.usage_count;

  if (!isSameMonth) {
    usageMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    usageCount = 0;
  }

  const { error: updateError } = await supabase
    .from("shops")
    .update({
      usage_month: usageMonth.toISOString(),
      usage_count: usageCount + delta,
    })
    .eq("id", shopId);

  if (updateError) {
    console.error("incrementUsage update error", updateError);
    throw updateError;
  }
}

export async function getShopPlanAndUsage(shopId) {
  const { data, error } = await supabase
    .from("shops")
    .select("plan, usage_month, usage_count, monthly_cap")
    .eq("id", shopId)
    .single();

  if (error) {
    console.error("getShopPlanAndUsage error", error);
    throw error;
  }

  const planConfig = getPlanConfig(data.plan);
  return {
    plan: planConfig,
    usage: data.usage_count,
    cap: data.monthly_cap,
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
  const { channel, orderId, startDate, endDate, limit = 50 } = filters;

  let query = supabase
    .from("attribution")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Apply filters
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
export async function getSettings(shopId) {
  // First get the shop to determine plan
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("plan")
    .eq("id", shopId)
    .single();

  const plan = shop?.plan || "FREE";

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
        dm_automation_enabled: plan === "PRO" ? true : false,
        comment_automation_enabled: plan === "PRO" ? true : false,
        followup_enabled: false, // Only PRO can enable, defaults to false
        enabled_post_ids: null,
      };
    }
    console.error("getSettings error", error);
    throw error;
  }

  // Enforce plan restrictions - only PRO can use automation
  if (plan !== "PRO") {
    data.dm_automation_enabled = false;
    data.comment_automation_enabled = false;
  }

  return data;
}

/**
 * Update settings for a shop.
 */
export async function updateSettings(shopId, settings) {
  // First get the shop to determine plan
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("plan")
    .eq("id", shopId)
    .single();

  if (shopError) {
    console.error("updateSettings: Could not fetch shop", shopError);
    throw shopError;
  }

  const plan = shop?.plan || "FREE";
  const planConfig = getPlanConfig(plan);

  // Enforce plan restrictions - only PRO can use automation
  let dmAutomationEnabled = settings.dm_automation_enabled;
  let commentAutomationEnabled = settings.comment_automation_enabled;
  let followupEnabled = settings.followup_enabled;
  
  if (plan !== "PRO") {
    // FREE and GROWTH: automation not available
    dmAutomationEnabled = false;
    commentAutomationEnabled = false;
    followupEnabled = false;
  }

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

  // Apply filters
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
  const { channel = null, startDate = null, endDate = null } = options;

  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);

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
 */
export async function saveProductMapping(shopId, igMediaId, productId, variantId = null) {
  // Check if mapping exists
  const { data: existing } = await supabase
    .from("post_product_map")
    .select("*")
    .eq("shop_id", shopId)
    .eq("ig_media_id", igMediaId)
    .maybeSingle();

  const mappingData = {
    shop_id: shopId,
    ig_media_id: igMediaId,
    product_id: productId,
    variant_id: variantId,
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
  const { startDate, endDate } = options;
  
  const analytics = {
    // Free tier metrics
    messagesSent: 0,
    linksSent: 0,
    clicks: 0,
    ctr: 0,
    topTriggerPhrases: [],
    
    // Growth tier metrics (additional)
    channelPerformance: {
      dm: { sent: 0, responded: 0, clicks: 0 },
      comment: { sent: 0, responded: 0, clicks: 0 },
    },
    topPosts: [],
  };

  try {
    // Build date filter for Supabase queries
    let messagesQuery = supabase
      .from("messages")
      .select(`
        id,
        channel,
        ai_intent,
        last_user_message_at,
        created_at
      `)
      .eq("shop_id", shopId);

    if (startDate) {
      messagesQuery = messagesQuery.gte("created_at", startDate);
    }
    if (endDate) {
      messagesQuery = messagesQuery.lte("created_at", endDate);
    }

    // Get all messages that have links sent
    const { data: allMessages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error("[analytics] Error fetching messages:", messagesError);
      return analytics;
    }

    // Count all messages (not just ones with links)
    analytics.messagesSent = (allMessages || []).length;

    // Get ALL links_sent for this shop (not just those linked to messages)
    let linksQuery = supabase
      .from("links_sent")
      .select("id, message_id, link_id")
      .eq("shop_id", shopId);

    if (startDate) {
      linksQuery = linksQuery.gte("sent_at", startDate);
    }
    if (endDate) {
      linksQuery = linksQuery.lte("sent_at", endDate);
    }

    const { data: linksSent, error: linksError } = await linksQuery;

    if (linksError) {
      console.error("[analytics] Error fetching links sent:", linksError);
    }

    // Count all links sent
    analytics.linksSent = (linksSent || []).length;

    // Create map of message_id -> link_id for click tracking
    const messageToLinkId = {};
    const linkIdToChannel = {}; // Map link_id -> channel for click tracking
    const linkIds = [];
    (linksSent || []).forEach(link => {
      if (link.message_id) {
        messageToLinkId[link.message_id] = link.link_id;
        // Find the message to get its channel
        const message = (allMessages || []).find(m => m.id === link.message_id);
        if (message && link.link_id) {
          linkIdToChannel[link.link_id] = message.channel;
        }
      }
      if (link.link_id) {
        linkIds.push(link.link_id);
      }
    });

    // Filter messages that have links sent (for channel performance and trigger phrases)
    const messagesWithLinks = (allMessages || []).filter(m => messageToLinkId[m.id]);

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
  const { startDate, endDate } = options;
  
  const proAnalytics = {
    customerSegments: {
      firstTime: 0,
      repeat: 0,
      total: 0,
    },
    sentimentAnalysis: {
      positive: 0,
      neutral: 0,
      negative: 0,
      total: 0,
    },
    revenueAttribution: {
      total: 0,
      byChannel: {
        dm: 0,
        comment: 0,
      },
      currency: "USD",
    },
    followUpPerformance: {
      withFollowup: {
        messages: 0,
        clicks: 0,
        revenue: 0,
        ctr: 0,
      },
      withoutFollowup: {
        messages: 0,
        clicks: 0,
        revenue: 0,
        ctr: 0,
      },
    },
  };

  try {
    // Build date filter
    let messagesQuery = supabase
      .from("messages")
      .select("*")
      .eq("shop_id", shopId);

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
      const messageToLinkId = {};
      linksSent.forEach(link => {
        if (link.message_id) {
          messageToLinkId[link.message_id] = link.link_id;
        }
      });

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

