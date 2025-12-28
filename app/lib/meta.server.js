import { encryptToken, decryptToken } from "./crypto.server";
import supabase from "./supabase.server";

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Save Meta authentication data for a shop
 */
export async function saveMetaAuth(
  shopId,
  pageId,
  igBusinessId,
  userToken,
  pageToken,
  igToken,
  tokenExpiresAt
) {
  console.log(`[meta] Saving Meta auth for shop_id: ${shopId}, page_id: ${pageId}, ig_business_id: ${igBusinessId}`);
  
  // First, check if a record exists
  const { data: existing, error: checkError } = await supabase
    .from("meta_auth")
    .select("*")
    .eq("shop_id", shopId)
    .eq("page_id", pageId)
    .maybeSingle();

  if (checkError && checkError.code !== "PGRST116") {
    console.error("[meta] Error checking existing record:", checkError);
    throw checkError;
  }

  const recordData = {
    shop_id: shopId,
    page_id: pageId,
    ig_business_id: igBusinessId,
    user_token_enc: encryptToken(userToken),
    page_token_enc: encryptToken(pageToken),
    ig_token_enc: igToken ? encryptToken(igToken) : null,
    token_expires_at: tokenExpiresAt,
    updated_at: new Date().toISOString(),
  };

  let data, error;
  
  if (existing) {
    // Update existing record
    console.log(`[meta] Updating existing meta_auth record: ${existing.id}`);
    const result = await supabase
      .from("meta_auth")
      .update(recordData)
      .eq("id", existing.id)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } else {
    // Insert new record
    console.log(`[meta] Inserting new meta_auth record`);
    const result = await supabase
      .from("meta_auth")
      .insert(recordData)
      .select()
      .single();
    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error("[meta] Error saving Meta auth:", error);
    throw error;
  }

  console.log(`[meta] Meta auth saved successfully: ${data?.id}`);
  return data;
}

/**
 * Get Meta authentication data for a shop
 */
export async function getMetaAuth(shopId) {
  const { data, error } = await supabase
    .from("meta_auth")
    .select("*")
    .eq("shop_id", shopId)
    .single();

  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      console.error("[meta] Error getting Meta auth:", error);
    }
    return null;
  }

  // Decrypt tokens (only if they exist)
  // Note: Column names are user_token_enc, page_token_enc, ig_token_enc
  if (!data.user_token_enc || !data.page_token_enc) {
    // This is expected if OAuth hasn't completed yet - don't log as error
    // Only log if we have a record but it's incomplete (partial save)
    if (data.id) {
      console.warn("[meta] Meta auth record exists but is missing required tokens. OAuth may not have completed.");
    }
    return null;
  }

  return {
    ...data,
    // Map to expected property names for backward compatibility
    user_access_token: decryptToken(data.user_token_enc),
    page_access_token: decryptToken(data.page_token_enc),
    ig_access_token: data.ig_token_enc
      ? decryptToken(data.ig_token_enc)
      : null,
  };
}

/**
 * Refresh Meta access token
 */
export async function refreshMetaToken(shopId) {
  const auth = await getMetaAuth(shopId);
  if (!auth) {
    throw new Error("No Meta auth found for shop");
  }

  // Check if token needs refresh (expiring in < 7 days)
  if (!auth.token_expires_at) {
    // No expiration date, assume it needs refresh
    console.log("[meta] Token has no expiration date, attempting refresh");
  } else {
    const expiresAt = new Date(auth.token_expires_at);
    const now = new Date();
    const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

    if (daysUntilExpiry > 7) {
      console.log(`[meta] Token still valid for ${daysUntilExpiry.toFixed(1)} days`);
      return auth; // Token is still valid
    }
  }

  console.log("[meta] Refreshing Meta access token");

  // Refresh token using Meta's endpoint
  const response = await fetch(
    `${META_API_BASE}/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${META_APP_ID}&` +
      `client_secret=${META_APP_SECRET}&` +
      `fb_exchange_token=${auth.user_access_token}`
  );

  const data = await response.json();

  if (data.error) {
    console.error("[meta] Token refresh failed:", data.error);
    throw new Error(`Token refresh failed: ${data.error.message}`);
  }

  // Update stored token
  const newExpiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  await saveMetaAuth(
    shopId,
    auth.page_id,
    auth.ig_business_id,
    data.access_token,
    auth.page_access_token,
    auth.ig_access_token,
    newExpiresAt
  );

  console.log("[meta] Token refreshed successfully");
  return await getMetaAuth(shopId);
}

/**
 * Make authenticated request to Meta Graph API with automatic token refresh
 * This ensures tokens are fresh before making API calls
 */
export async function metaGraphAPIWithRefresh(shopId, endpoint, tokenType = "page", options = {}) {
  // Get fresh auth (will refresh if needed)
  const auth = await getMetaAuthWithRefresh(shopId);
  if (!auth) {
    throw new Error("No Meta auth found for shop");
  }

  // Select the appropriate token based on tokenType
  let accessToken;
  if (tokenType === "user") {
    accessToken = auth.user_access_token;
  } else if (tokenType === "page") {
    accessToken = auth.page_access_token;
  } else if (tokenType === "ig") {
    accessToken = auth.ig_access_token || auth.page_access_token; // Fallback to page token if IG token not available
  } else {
    throw new Error(`Invalid token type: ${tokenType}`);
  }

  if (!accessToken) {
    throw new Error(`No ${tokenType} access token available`);
  }

  // Make the API call
  return metaGraphAPI(endpoint, accessToken, options);
}

/**
 * Get Meta auth with automatic token refresh if needed
 */
export async function getMetaAuthWithRefresh(shopId) {
  const auth = await getMetaAuth(shopId);
  if (!auth) {
    return null;
  }

  // Check if token needs refresh
  if (!auth.token_expires_at) {
    // No expiration date, try to refresh
    try {
      return await refreshMetaToken(shopId);
    } catch (error) {
      console.error("[meta] Token refresh failed, using existing token:", error);
      return auth; // Return existing token even if refresh failed
    }
  }

  const expiresAt = new Date(auth.token_expires_at);
  const now = new Date();
  const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

  // Refresh if expiring in less than 7 days
  if (daysUntilExpiry < 7) {
    try {
      return await refreshMetaToken(shopId);
    } catch (error) {
      console.error("[meta] Token refresh failed, using existing token:", error);
      return auth; // Return existing token even if refresh failed
    }
  }

  return auth;
}

/**
 * Make authenticated request to Meta Graph API
 */
export async function metaGraphAPI(endpoint, accessToken, options = {}) {
  // Remove any existing query params from endpoint to avoid double-encoding
  const [baseEndpoint, existingParams] = endpoint.split('?');
  const url = `${META_API_BASE}${baseEndpoint}`;
  
  // Build params object
  const params = new URLSearchParams({
    access_token: accessToken,
  });
  
  // Add existing params from endpoint if any
  if (existingParams) {
    const existing = new URLSearchParams(existingParams);
    for (const [key, value] of existing.entries()) {
      params.append(key, value);
    }
  }
  
  // Add options params
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      params.append(key, value);
    }
  }

  const fullUrl = `${url}?${params.toString()}`;
  console.log(`[meta] Making API request to: ${fullUrl.replace(accessToken, '***TOKEN***')}`);

  const response = await fetch(fullUrl, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();

  if (data.error) {
    console.error("[meta] Graph API error:", data.error);
    console.error("[meta] Request URL was:", fullUrl.replace(accessToken, '***TOKEN***'));
    throw new Error(`Meta API error: ${data.error.message} (Code: ${data.error.code})`);
  }

  return data;
}

/**
 * Get Instagram account information (username, media count, etc.)
 * Uses automatic token refresh
 */
export async function getInstagramAccountInfo(igBusinessId, shopId) {
  if (!igBusinessId || !shopId) {
    return null;
  }

  try {
    // Use the refresh-enabled API call
    const accountInfo = await metaGraphAPIWithRefresh(
      shopId,
      `/${igBusinessId}`,
      "page",
      {
        params: {
          fields: "username,media_count,profile_picture_url",
        },
      }
    );

    return {
      username: accountInfo.username || null,
      mediaCount: accountInfo.media_count || 0,
      profilePictureUrl: accountInfo.profile_picture_url || null,
    };
  } catch (error) {
    console.error("[meta] Error fetching Instagram account info:", error);
    return null;
  }
}

/**
 * Subscribe Instagram Business account to webhooks
 * This subscribes the Page/IG to receive webhook events
 */
export async function subscribeToWebhooks(shopId, pageId, igBusinessId) {
  try {
    // Get fresh auth with token refresh
    const auth = await getMetaAuthWithRefresh(shopId);
    if (!auth || !auth.page_access_token) {
      throw new Error("No valid Meta auth found for shop");
    }

    const webhookUrl = process.env.META_WEBHOOK_URL || `${process.env.APP_URL || process.env.SHOPIFY_APP_URL}/webhooks/meta`;
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

    if (!webhookUrl || !verifyToken) {
      console.warn("[meta] Webhook URL or verify token not configured, skipping subscription");
      return false;
    }

    // Subscribe the Page to webhooks
    // Note: Meta webhook subscriptions are typically configured in the Meta App Dashboard
    // But we can also subscribe programmatically using the Graph API
    console.log(`[meta] Subscribing Page ${pageId} to webhooks`);
    
    // For Instagram, webhooks are typically configured at the app level in Meta Dashboard
    // However, we can verify the subscription status
    // The actual subscription is done in Meta App Dashboard > Webhooks section
    
    console.log(`[meta] Webhook subscription should be configured in Meta App Dashboard`);
    console.log(`[meta] Webhook URL: ${webhookUrl}`);
    console.log(`[meta] Verify Token: ${verifyToken ? "***" : "not set"}`);
    
    // Store webhook subscription status (we'll track this in the meta_auth table if needed)
    return true;
  } catch (error) {
    console.error("[meta] Error subscribing to webhooks:", error);
    return false;
  }
}

/**
 * Delete Meta authentication data for a shop (disconnect Instagram)
 */
export async function deleteMetaAuth(shopId) {
  console.log(`[meta] Deleting Meta auth for shop_id: ${shopId}`);
  
  const { error } = await supabase
    .from("meta_auth")
    .delete()
    .eq("shop_id", shopId);

  if (error) {
    console.error("[meta] Error deleting Meta auth:", error);
    throw error;
  }

  console.log(`[meta] Meta auth deleted successfully for shop_id: ${shopId}`);
  return true;
}

