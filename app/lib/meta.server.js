import { encryptToken, decryptToken } from "./crypto.server";
import supabase from "./supabase.server";

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Instagram Login (Business Login) - separate product; uses different App ID/Secret if set
export const META_INSTAGRAM_APP_ID = process.env.META_INSTAGRAM_APP_ID || process.env.META_APP_ID;
export const META_INSTAGRAM_APP_SECRET = process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
const INSTAGRAM_OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
export const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_GRAPH_VERSION = process.env.META_INSTAGRAM_API_VERSION || "v24.0";
export const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`;

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
 * Returns auth_type: 'facebook' | 'instagram' (Instagram Login = no Facebook Page)
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

  const authType = data.auth_type || "facebook";

  // Instagram Login: only page_token_enc required (we store the IG user token there)
  // Facebook Login: both user_token_enc and page_token_enc required
  if (authType === "instagram") {
    if (!data.page_token_enc) {
      if (data.id) {
        console.warn("[meta] Meta auth (Instagram Login) record is missing token.");
      }
      return null;
    }
  } else {
    if (!data.user_token_enc || !data.page_token_enc) {
      if (data.id) {
        console.warn("[meta] Meta auth record exists but is missing required tokens. OAuth may not have completed.");
      }
      return null;
    }
  }

  return {
    ...data,
    auth_type: authType,
    user_access_token: data.user_token_enc ? decryptToken(data.user_token_enc) : null,
    page_access_token: decryptToken(data.page_token_enc),
    ig_access_token: data.ig_token_enc
      ? decryptToken(data.ig_token_enc)
      : decryptToken(data.page_token_enc),
  };
}

/**
 * Save Meta authentication for Instagram Login (Business Login) - no Facebook Page
 * Uses graph.instagram.com and Instagram user access token.
 * Requires meta_auth.auth_type column (run migration if needed).
 */
export async function saveMetaAuthForInstagram(shopId, igUserId, accessToken, tokenExpiresAt) {
  console.log(`[meta] Saving Instagram Login auth for shop_id: ${shopId}, ig_user_id: ${igUserId}`);

  const { data: existing } = await supabase
    .from("meta_auth")
    .select("id")
    .eq("shop_id", shopId)
    .maybeSingle();

  const recordData = {
    shop_id: shopId,
    page_id: null,
    ig_business_id: igUserId,
    user_token_enc: encryptToken(accessToken),
    page_token_enc: encryptToken(accessToken),
    ig_token_enc: encryptToken(accessToken),
    token_expires_at: tokenExpiresAt,
    updated_at: new Date().toISOString(),
    auth_type: "instagram",
  };

  let result;
  if (existing) {
    result = await supabase
      .from("meta_auth")
      .update(recordData)
      .eq("id", existing.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from("meta_auth")
      .insert(recordData)
      .select()
      .single();
  }

  if (result.error) {
    console.error("[meta] Error saving Instagram Login auth:", result.error);
    throw result.error;
  }
  console.log("[meta] Instagram Login auth saved successfully");
  return result.data;
}

/**
 * Refresh Meta access token (Facebook or Instagram Login)
 */
export async function refreshMetaToken(shopId) {
  const auth = await getMetaAuth(shopId);
  if (!auth) {
    throw new Error("No Meta auth found for shop");
  }

  if (auth.auth_type === "instagram") {
    return refreshInstagramLoginToken(shopId, auth);
  }

  // Check if token needs refresh (expiring in < 7 days or already expired)
  if (!auth.token_expires_at) {
    console.log("[meta] Token has no expiration date, attempting refresh");
  } else {
    const expiresAt = new Date(auth.token_expires_at);
    const now = new Date();
    const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

    if (daysUntilExpiry > 7) {
      console.log(`[meta] Token still valid for ${daysUntilExpiry.toFixed(1)} days`);
      return auth;
    }
    if (expiresAt < now) {
      console.log("[meta] Token has expired, refreshing immediately");
    }
  }

  console.log("[meta] Refreshing Meta (Facebook) access token");

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
 * Refresh Instagram Login (Business Login) long-lived token via graph.instagram.com
 */
async function refreshInstagramLoginToken(shopId, auth) {
  if (auth.token_expires_at) {
    const expiresAt = new Date(auth.token_expires_at);
    const now = new Date();
    const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry > 7 && expiresAt > now) {
      return auth;
    }
  }

  console.log("[meta] Refreshing Instagram Login access token");
  const url = `${INSTAGRAM_GRAPH_BASE}/refresh_access_token?` +
    `grant_type=ig_refresh_token&` +
    `access_token=${auth.page_access_token}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error("[meta] Instagram Login token refresh failed:", data.error);
    throw new Error(`Token refresh failed: ${data.error.message || "Unknown error"}`);
  }

  const newExpiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  await saveMetaAuthForInstagram(shopId, auth.ig_business_id, data.access_token, newExpiresAt);
  return await getMetaAuth(shopId);
}

/**
 * Make authenticated request to Instagram Graph API (graph.instagram.com).
 * Per Meta docs (Instagram API with Instagram Login): use Bearer token and /v24.0/ in path.
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/
 */
export async function metaGraphAPIInstagram(endpoint, accessToken, options = {}) {
  const [baseEndpoint, existingParams] = endpoint.split("?");
  const path = baseEndpoint.startsWith("/") ? baseEndpoint : `/${baseEndpoint}`;
  const params = new URLSearchParams();
  if (existingParams) {
    for (const [k, v] of new URLSearchParams(existingParams).entries()) {
      params.append(k, v);
    }
  }
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      params.append(k, v);
    }
  }
  const query = params.toString();
  const fullUrl = query ? `${INSTAGRAM_GRAPH_BASE}${path}?${query}` : `${INSTAGRAM_GRAPH_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    ...options.headers,
  };
  const res = await fetch(fullUrl, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Instagram API error: ${data.error.message} (Code: ${data.error.code})`);
  }
  return data;
}

/**
 * Make authenticated request to Meta Graph API with automatic token refresh
 * Uses graph.facebook.com (Facebook Login) or graph.instagram.com (Instagram Login) based on auth_type.
 */
export async function metaGraphAPIWithRefresh(shopId, endpoint, tokenType = "page", options = {}) {
  const auth = await getMetaAuthWithRefresh(shopId);
  if (!auth) {
    throw new Error("No Meta auth found for shop");
  }

  const accessToken = tokenType === "user"
    ? auth.user_access_token
    : (auth.ig_access_token || auth.page_access_token);
  if (!accessToken) {
    throw new Error(`No ${tokenType} access token available`);
  }

  if (auth.auth_type === "instagram") {
    return metaGraphAPIInstagram(endpoint, accessToken, options);
  }
  return metaGraphAPI(endpoint, accessToken, options);
}

/**
 * Fetch message content by message ID (mid).
 * Used when webhook sends message_edit without text so we can still log and reply.
 * Uses the same host as the shop's auth: Instagram token → graph.instagram.com; Page token → graph.facebook.com.
 * (Instagram tokens are not valid on graph.facebook.com and cause "Cannot parse access token".)
 */
export async function getInstagramMessageByMid(shopId, mid) {
  if (!shopId || !mid) return null;
  try {
    const endpoint = `/${encodeURIComponent(mid)}`;
    const data = await metaGraphAPIWithRefresh(shopId, endpoint, "page", {
      params: { fields: "message,from,created_time" },
    });
    const text = data.message ?? null;
    const fromId = data.from?.id ?? null;
    const createdTime = data.created_time ?? null;
    if (text != null) {
      console.log("[meta] getInstagramMessageByMid ok, text length:", text.length);
      return { text, fromId, createdTime };
    }
    console.warn("[meta] getInstagramMessageByMid: API returned no message field");
    return null;
  } catch (e) {
    console.warn("[meta] getInstagramMessageByMid failed:", e?.message);
    return null;
  }
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

  // Refresh if expired or expiring in less than 7 days
  if (daysUntilExpiry < 7 || expiresAt < now) {
    if (expiresAt < now) {
      console.log("[meta] Token has expired, refreshing immediately");
    }
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
 * Process a manual access token for testing (before app approval)
 * Extracts Page ID, Instagram Business ID, and exchanges for long-lived token
 */
export async function processManualToken(shopId, userAccessToken) {
  console.log(`[meta] Processing manual token for shop_id: ${shopId}`);
  
  // Clean and validate token
  const cleanToken = userAccessToken.trim().replace(/\s+/g, '');
  if (!cleanToken || cleanToken.length < 50) {
    throw new Error("Invalid token format. Please check that you copied the entire token.");
  }
  
  console.log(`[meta] Token length: ${cleanToken.length} characters`);
  
  // First, try to debug the token to see what's wrong
  let tokenInfo = null;
  try {
    const appAccessToken = `${META_APP_ID}|${META_APP_SECRET}`;
    tokenInfo = await metaGraphAPI("/debug_token", appAccessToken, {
      params: {
        input_token: cleanToken
      }
    });
    
    console.log(`[meta] Token debug info:`, JSON.stringify(tokenInfo, null, 2));
    
    // Check if token is valid
    if (tokenInfo?.data?.is_valid === false) {
      const errorMsg = tokenInfo.data.error?.message || "Token is invalid";
      throw new Error(`Invalid token: ${errorMsg}`);
    }
    
    // Check token type - test user tokens might not work the same way
    if (tokenInfo?.data?.type) {
      console.log(`[meta] Token type: ${tokenInfo.data.type}`);
      if (tokenInfo.data.type === "USER" && tokenInfo.data.app_id !== META_APP_ID) {
        throw new Error(`This token is for a different app (App ID: ${tokenInfo.data.app_id}). Make sure you're using a token for this app.`);
      }
    }
    
    // Check token expiration
    if (tokenInfo?.data?.expires_at) {
      const expiresAt = new Date(tokenInfo.data.expires_at * 1000);
      const now = new Date();
      if (expiresAt < now) {
        throw new Error("Token has expired. The token Meta provided when you added the test account may have expired. You'll need to generate a new token.");
      }
      console.log(`[meta] Token expires at: ${expiresAt.toISOString()}`);
    }
    
    // Check scopes and provide detailed feedback
    if (tokenInfo?.data?.scopes) {
      console.log(`[meta] Token scopes:`, tokenInfo.data.scopes);
      const requiredScopes = ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata'];
      const missingScopes = requiredScopes.filter(scope => !tokenInfo.data.scopes.includes(scope));
      
      if (missingScopes.length > 0) {
        console.warn(`[meta] Token is missing required scopes:`, missingScopes);
        console.warn(`[meta] Token has these scopes:`, tokenInfo.data.scopes);
        throw new Error(`The token Meta provided when you added the test account is missing required permissions: ${missingScopes.join(', ')}. The token needs ALL of these: ${requiredScopes.join(', ')}. You may need to generate a token manually with all permissions, or the test account token may not have the right permissions.`);
      }
      
      console.log(`[meta] ✅ Token has all required scopes`);
    } else {
      console.warn(`[meta] Could not verify token scopes - token info may be incomplete`);
      // Don't throw here - let it try to proceed and see what happens
    }
  } catch (debugError) {
    console.error(`[meta] Token debug failed:`, debugError);
    
    // If we got token info but it failed validation, provide specific feedback
    if (tokenInfo && tokenInfo.data) {
      const tokenType = tokenInfo.data.type || 'unknown';
      const tokenAppId = tokenInfo.data.app_id;
      const hasScopes = tokenInfo.data.scopes || [];
      
      if (tokenAppId && tokenAppId !== META_APP_ID) {
        throw new Error(`This token is for a different Meta app. The token you got when adding the test account might be for a different app. Make sure you're using a token for the correct app.`);
      }
      
      if (hasScopes.length > 0 && hasScopes.length < 4) {
        throw new Error(`The token Meta provided when you added the test account only has these permissions: ${hasScopes.join(', ')}. It needs ALL of these: instagram_basic, pages_show_list, pages_read_engagement, pages_manage_metadata. The test account token may not have all required permissions.`);
      }
    }
    
    // Provide more helpful error messages based on error code
    if (debugError.message.includes("Code: 2")) {
      throw new Error(`Meta API temporarily unavailable. The token Meta provided when you added the test account might not have the right permissions or might be a different type of token. Try using the OAuth flow or generating a token manually.`);
    } else if (debugError.message.includes("Code: 190")) {
      throw new Error(`Invalid access token format. Please check that you copied the entire token without any extra spaces or line breaks.`);
    } else if (debugError.message.includes("Code: 10")) {
      throw new Error(`Permission denied. The token Meta provided when you added the test account doesn't have the required permissions. Test account tokens may not have all the permissions needed. You may need to use the OAuth flow instead.`);
    } else if (!debugError.message.includes("Token is missing required permissions")) {
      // Only throw generic error if we haven't already thrown a specific one
      throw new Error(`Token validation failed: ${debugError.message}. The token Meta provided when you added the test account may not work for this purpose. You may need to use the OAuth flow or generate a token with all required permissions.`);
    } else {
      throw debugError; // Re-throw if we already have a specific error message
    }
  }
  
  // Verify token works by calling /me and show which account it's for
  let userInfo = null;
  try {
    const meData = await metaGraphAPI("/me", cleanToken, {
      params: {
        fields: "id,name,email"
      }
    });
    userInfo = meData;
    console.log(`[meta] Token verified successfully. User ID: ${meData.id}, Name: ${meData.name || 'N/A'}`);
  } catch (error) {
    console.error(`[meta] Token verification failed:`, error);
    
    // Provide more helpful error messages
    if (error.message.includes("Code: 2")) {
      throw new Error(`Meta API temporarily unavailable. This could mean: 1) The token is invalid or expired, 2) Meta's API is having issues, 3) The token doesn't have the required permissions. Try generating a fresh token with all required permissions.`);
    } else if (error.message.includes("Code: 190")) {
      throw new Error(`Invalid access token. Please check that you copied the entire token without any extra spaces or line breaks.`);
    } else if (error.message.includes("Code: 10")) {
      throw new Error(`Permission denied. The token doesn't have the required permissions. Make sure you selected all required permissions when generating the token.`);
    } else {
      throw new Error(`Token verification failed: ${error.message}. Please check that your token has the required permissions and hasn't expired.`);
    }
  }
  
  // Extract Page ID and Instagram ID from token debug info (we already have this from above)
  let pageId = null;
  let igBusinessId = null;
  
  try {
    const appAccessToken = `${META_APP_ID}|${META_APP_SECRET}`;
    const tokenInfo = await metaGraphAPI("/debug_token", appAccessToken, {
      params: {
        input_token: cleanToken
      }
    });
    
    // Extract from granular_scopes
    if (tokenInfo?.data?.granular_scopes) {
      for (const scope of tokenInfo.data.granular_scopes) {
        if (scope.scope === 'pages_show_list' && scope.target_ids && scope.target_ids.length > 0) {
          pageId = scope.target_ids[0];
          console.log(`[meta] Found Page ID from granular_scopes: ${pageId}`);
        }
        if (scope.scope === 'instagram_basic' && scope.target_ids && scope.target_ids.length > 0) {
          igBusinessId = scope.target_ids[0];
          console.log(`[meta] Found Instagram Business ID from granular_scopes: ${igBusinessId}`);
        }
      }
    }
  } catch (debugError) {
    console.warn(`[meta] Could not extract IDs from granular_scopes:`, debugError.message);
  }
  
  // Get Page info and access token
  let pageAccessToken = null;
  let pageName = null;
  
  if (pageId && igBusinessId) {
    try {
      const pageInfo = await metaGraphAPI(`/${pageId}`, cleanToken, {
        params: {
          fields: "id,name,access_token"
        }
      });
      pageAccessToken = pageInfo.access_token;
      pageName = pageInfo.name;
    } catch (pageError) {
      console.error(`[meta] Error fetching Page info:`, pageError);
      pageId = null;
      igBusinessId = null;
    }
  }
  
  // Fallback to /me/accounts
  if (!pageId || !pageAccessToken) {
    try {
      const pagesData = await metaGraphAPI("/me/accounts", cleanToken, {
        params: {
          fields: "id,name,access_token,instagram_business_account"
        }
      });
      
      if (pagesData?.data && pagesData.data.length > 0) {
        const page = pagesData.data[0];
        pageId = page.id;
        pageAccessToken = page.access_token;
        pageName = page.name;
        
        if (!igBusinessId && page.instagram_business_account) {
          igBusinessId = page.instagram_business_account.id;
        } else if (!igBusinessId) {
          const igAccountData = await metaGraphAPI(
            `/${pageId}?fields=instagram_business_account`,
            pageAccessToken
          );
          if (igAccountData.instagram_business_account) {
            igBusinessId = igAccountData.instagram_business_account.id;
          }
        }
      }
    } catch (apiError) {
      console.error(`[meta] Error fetching Facebook Pages:`, apiError);
      throw new Error(`Failed to fetch Facebook Pages: ${apiError.message}`);
    }
  }
  
  // Validate required data
  if (!pageId || !pageAccessToken) {
    throw new Error("Could not retrieve Facebook Page information. Please ensure your token has the required permissions.");
  }
  
  if (!igBusinessId) {
    throw new Error("No Instagram Business account found. Please link an Instagram Business account to your Facebook Page.");
  }
  
  console.log(`[meta] ✅ Using Page: ${pageName || pageId} (ID: ${pageId})`);
  console.log(`[meta] ✅ Instagram Business ID: ${igBusinessId}`);
  
  // Exchange for long-lived token
  const longLivedTokenUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${META_APP_ID}&` +
    `client_secret=${META_APP_SECRET}&` +
    `fb_exchange_token=${cleanToken}`;

  const longLivedResponse = await fetch(longLivedTokenUrl);
  const longLivedData = await longLivedResponse.json();

  if (longLivedData.error) {
    console.warn(`[meta] Long-lived token exchange failed:`, longLivedData.error);
    console.warn(`[meta] Using short-lived token (will need to refresh manually)`);
  }

  const finalUserToken = longLivedData.access_token || cleanToken;
  const expiresAt = longLivedData.expires_in
    ? new Date(Date.now() + longLivedData.expires_in * 1000).toISOString()
    : null;

  // Save to database
  await saveMetaAuth(
    shopId,
    pageId,
    igBusinessId,
    finalUserToken,
    pageAccessToken,
    pageAccessToken, // Use page token for IG API calls
    expiresAt
  );
  
  console.log(`[meta] ✅ Manual token processed and saved successfully`);
  
  return {
    pageId,
    igBusinessId,
    pageName,
    expiresAt,
    userInfo: userInfo ? {
      id: userInfo.id,
      name: userInfo.name,
      email: userInfo.email
    } : null
  };
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
 * Get Instagram account information (username, media count, id, etc.)
 * For Instagram Login uses GET /me; for Facebook Login uses GET /{ig_business_id}
 */
export async function getInstagramAccountInfo(igBusinessId, shopId) {
  if (!shopId) {
    return null;
  }

  try {
    const auth = await getMetaAuthWithRefresh(shopId);
    if (!auth || !auth.page_access_token) {
      return null;
    }

    const isInstagramLogin = auth.auth_type === "instagram";
    const endpoint = isInstagramLogin ? "/me" : `/${igBusinessId}`;
    const fields = isInstagramLogin
      ? "user_id,username,media_count,profile_picture_url,account_type"
      : "username,media_count,profile_picture_url";

    const accountInfo = await (isInstagramLogin ? metaGraphAPIInstagram : metaGraphAPI)(
      endpoint,
      auth.page_access_token,
      { params: { fields } }
    );

    // Instagram Login /me can return { data: [ { ... } ] } or { user_id, username, ... }
    const payload = accountInfo.data && accountInfo.data[0] ? accountInfo.data[0] : accountInfo;
    const userId = payload.user_id || payload.id || igBusinessId;

    return {
      id: userId,
      username: payload.username || null,
      mediaCount: payload.media_count ?? 0,
      profilePictureUrl: payload.profile_picture_url || null,
      accountType: payload.account_type || null,
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
/**
 * Subscribe Page to Instagram webhooks programmatically
 * This subscribes the Page to receive messages and comments webhooks
 */
/**
 * Check webhook subscription status for a Page
 */
export async function checkWebhookStatus(shopId, pageId) {
  try {
    const auth = await getMetaAuthWithRefresh(shopId);
    if (!auth || !auth.page_access_token) {
      return { error: "No page access token found" };
    }

    const checkUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`;
    
    const response = await fetch(`${checkUrl}?access_token=${auth.page_access_token}`);
    const result = await response.json();
    
    if (result.error) {
      return { 
        error: result.error.message,
        code: result.error.code,
        subscribed: false
      };
    }
    
    // Check if app is subscribed
    const subscribed = result.data && result.data.some(app => app.id === META_APP_ID);
    
    return {
      subscribed,
      data: result.data || [],
      appId: META_APP_ID
    };
  } catch (error) {
    console.error("[meta] Error checking webhook status:", error);
    return { error: error.message };
  }
}

export async function subscribeToWebhooks(shopId, pageId, igBusinessId) {
  try {
    // Get fresh auth with token refresh
    const auth = await getMetaAuthWithRefresh(shopId);
    if (!auth || !auth.page_access_token) {
      console.error("[meta] No page access token found for webhook subscription");
      return false;
    }

    console.log(`[meta] Subscribing Page ${pageId} to webhooks programmatically`);
    
    // Subscribe the Page to webhooks using Graph API
    // This subscribes to messages and comments for Instagram
    const subscribeUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/subscribed_apps`;
    
    const response = await fetch(subscribeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: auth.page_access_token,
        subscribed_fields: "messages",
      }),
    });

    const result = await response.json();
    
    if (result.success || result.data) {
      console.log(`[meta] ✅ Successfully subscribed Page ${pageId} to webhooks`);
      console.log(`[meta] Subscription result:`, result);
      return true;
    } else {
      console.warn(`[meta] Webhook subscription API call returned:`, result);
      // Don't throw - webhooks might already be configured in dashboard or require dashboard setup
      // Error codes like 200 (already subscribed) or specific permission errors are expected
      if (result.error) {
        console.warn(`[meta] Error details:`, result.error);
        // Error code 200 means already subscribed, which is fine
        if (result.error.code === 200) {
          console.log(`[meta] Page is already subscribed to webhooks`);
          return true;
        }
      }
      return false;
    }
  } catch (error) {
    console.error("[meta] Error subscribing to webhooks:", error);
    // Don't throw - webhooks might be configured in dashboard
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

/**
 * Fetch Instagram media (posts) for a business account
 * For Instagram Login uses /me/media (token identifies user); for Facebook Login uses /{igBusinessId}/media
 * @param {string} igBusinessId - Instagram Business Account ID (or user ID from token for Instagram Login)
 * @param {string} shopId - Shop ID for token refresh
 * @param {Object} options - Options (limit, after cursor, etc.)
 * @returns {Promise<Object>} - Media data with pagination
 */
export async function getInstagramMedia(igBusinessId, shopId, options = {}) {
  try {
    const auth = await getMetaAuthWithRefresh(shopId);
    if (!auth || !auth.page_access_token) {
      throw new Error("No Instagram access token available");
    }

    const limit = options.limit || 25;
    const after = options.after || null;
    const params = {
      fields: "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count",
      limit,
    };
    if (after) params.after = after;

    // Instagram Login: graph.instagram.com uses /me/media for current user's media
    const mediaEndpoint = auth.auth_type === "instagram" ? "/me/media" : `/${igBusinessId}/media`;
    const mediaData = await metaGraphAPIWithRefresh(shopId, mediaEndpoint, "page", { params });

    return {
      data: mediaData.data || [],
      paging: mediaData.paging || {},
    };
  } catch (error) {
    console.error("[meta] Error fetching Instagram media:", error);
    throw error;
  }
}

