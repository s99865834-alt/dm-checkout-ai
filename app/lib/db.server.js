import supabase from "./supabase.server";
import { encryptToken, decryptToken } from "./crypto.server";
import { getPlanConfig } from "./plans";

export async function getShopByDomain(shopifyDomain) {
  const { data, error } = await supabase
    .from("shops")
    .select("*")
    .eq("shopify_domain", shopifyDomain)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("getShopByDomain error", error);
  }
  return data || null;
}

export async function createOrUpdateShop(shopifyDomain, defaults = {}) {
  const nowMonth = new Date();
  const usageMonth = new Date(
    nowMonth.getFullYear(),
    nowMonth.getMonth(),
    1
  ).toISOString();

  const base = {
    plan: "FREE",
    monthly_cap: 25,
    usage_month: usageMonth,
    usage_count: 0,
    priority_support: false,
    active: true,
    ...defaults,
    shopify_domain: shopifyDomain,
  };

  const { data, error } = await supabase
    .from("shops")
    .upsert(base, {
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

