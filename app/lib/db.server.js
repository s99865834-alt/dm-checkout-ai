import supabase from "./supabase.server";
import { encryptToken, decryptToken } from "./crypto.server";
import { getPlanConfig } from "./plans";

/**
 * Get default channel preference based on plan
 */
function getDefaultChannelPreference(plan) {
  const planConfig = getPlanConfig(plan);
  
  if (plan === "FREE") {
    // FREE: DM responses only
    return "dm";
  } else if (plan === "GROWTH") {
    // GROWTH: Comments and DMs (both, but locked - can't choose)
    return "both";
  } else if (plan === "PRO") {
    // PRO: can choose dm, comment, or both, default to "both"
    return "both";
  }
  
  return "dm"; // fallback
}

/**
 * Validate channel preference based on plan
 */
function validateChannelPreference(plan, channelPreference) {
  const planConfig = getPlanConfig(plan);
  
  if (plan === "FREE") {
    // FREE: must be "dm" only (DM responses only)
    return "dm";
  } else if (plan === "GROWTH") {
    // GROWTH: must be "both" (Comments and DMs, but locked - can't choose)
    return "both";
  } else if (plan === "PRO") {
    // PRO: can be "dm", "comment", or "both" (full control)
    return channelPreference || "both";
  }
  
  return "dm"; // fallback
}

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

  const { data, error } = await supabase
    .from("shops")
    .upsert(shopData, {
      onConflict: "shopify_domain",
    })
    .select("*")
    .single();

  if (error) {
    console.error("createOrUpdateShop error", error);
    throw error;
  }

  return data;
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
  const { shopId, messageId, productId, variantId, url, linkId } = params;

  const { data, error } = await supabase
    .from("links_sent")
    .insert({
      shop_id: shopId,
      message_id: messageId || null,
      product_id: productId || null,
      variant_id: variantId || null,
      url,
      link_id: linkId,
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
  const defaultChannelPreference = getDefaultChannelPreference(plan);

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
        comment_automation_enabled: plan !== "FREE", // FREE can't do comments
        enabled_post_ids: null,
        channel_preference: defaultChannelPreference,
      };
    }
    console.error("getSettings error", error);
    throw error;
  }

  // Validate and fix channel_preference based on current plan
  const validatedChannelPreference = validateChannelPreference(plan, data.channel_preference);
  
  // If channel_preference needs to be corrected, update it
  if (data.channel_preference !== validatedChannelPreference) {
    const { data: updated } = await supabase
      .from("settings")
      .update({ channel_preference: validatedChannelPreference })
      .eq("shop_id", shopId)
      .select("*")
      .single();
    
    return updated || { ...data, channel_preference: validatedChannelPreference };
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

  // Validate channel_preference based on plan
  let channelPreference = settings.channel_preference || getDefaultChannelPreference(plan);
  channelPreference = validateChannelPreference(plan, channelPreference);

  // Enforce plan restrictions
  let commentAutomationEnabled = settings.comment_automation_enabled;
  if (plan === "FREE") {
    // FREE: DM responses only - can't enable comment automation
    commentAutomationEnabled = false;
    // FREE: channel_preference must be "dm"
    channelPreference = "dm";
  } else if (plan === "GROWTH") {
    // GROWTH: Comments and DMs - both enabled, but channel_preference locked to "both"
    commentAutomationEnabled = commentAutomationEnabled ?? true;
    // GROWTH: channel_preference must be "both" (locked - can't choose)
    channelPreference = "both";
  }
  // PRO: full control - can choose "dm", "comment", or "both"

  const { data, error } = await supabase
    .from("settings")
    .upsert(
      {
        shop_id: shopId,
        dm_automation_enabled: settings.dm_automation_enabled ?? true,
        comment_automation_enabled: commentAutomationEnabled,
        enabled_post_ids: settings.enabled_post_ids || null,
        channel_preference: channelPreference,
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

