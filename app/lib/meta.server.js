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
  const { data, error } = await supabase
    .from("meta_auth")
    .upsert(
      {
        shop_id: shopId,
        page_id: pageId,
        ig_business_id: igBusinessId,
        user_access_token: encryptToken(userToken),
        page_access_token: encryptToken(pageToken),
        ig_access_token: igToken ? encryptToken(igToken) : null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "shop_id,page_id",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("[meta] Error saving Meta auth:", error);
    throw error;
  }

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
  if (!data.user_access_token || !data.page_access_token) {
    console.error("[meta] Missing required tokens in meta_auth record");
    return null;
  }

  return {
    ...data,
    user_access_token: decryptToken(data.user_access_token),
    page_access_token: decryptToken(data.page_access_token),
    ig_access_token: data.ig_access_token
      ? decryptToken(data.ig_access_token)
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
 * Make authenticated request to Meta Graph API
 */
export async function metaGraphAPI(endpoint, accessToken, options = {}) {
  const url = `${META_API_BASE}${endpoint}`;
  const params = new URLSearchParams({
    access_token: accessToken,
    ...options.params,
  });

  const response = await fetch(`${url}?${params}`, {
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
    throw new Error(`Meta API error: ${data.error.message} (Code: ${data.error.code})`);
  }

  return data;
}

