import { redirect } from "react-router";
import { getShopByDomain } from "../lib/db.server";
import { saveMetaAuth, metaGraphAPI } from "../lib/meta.server";

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
// Always use production URL for OAuth callback (must match what was sent to Meta)
const PRODUCTION_URL = "https://dm-checkout-ai-production.up.railway.app";
const APP_URL = process.env.APP_URL || process.env.SHOPIFY_APP_URL || PRODUCTION_URL;

/**
 * Instagram OAuth Callback
 * Handles the authorization code from Meta and exchanges it for tokens
 */
export async function loader({ request }) {
  console.log(`[oauth] ========================================`);
  console.log(`[oauth] Instagram OAuth callback received`);
  console.log(`[oauth] Request URL: ${request.url}`);
  console.log(`[oauth] Request method: ${request.method}`);
  console.log(`[oauth] Route is being hit - this is good!`);
  
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const shopParam = url.searchParams.get("shop") || url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorReason = url.searchParams.get("error_reason");
    const errorDescription = url.searchParams.get("error_description");
    
    console.log(`[oauth] Callback parameters:`, {
      hasCode: !!code,
      shopParam,
      error,
      errorReason,
      errorDescription,
      allParams: Object.fromEntries(url.searchParams.entries())
    });
    
    // Early return for testing - remove this after verifying route works
    if (!code && !error) {
      console.log(`[oauth] No code or error - this might be a test request`);
      return new Response("Meta OAuth callback endpoint is working. Waiting for OAuth redirect...", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Handle OAuth errors from Meta
    if (error) {
      console.error(`[oauth] Instagram OAuth error:`, { error, errorReason, errorDescription });
      const errorMessage = errorDescription || errorReason || error;
      // Try to get shop from URL params for error redirect
      const errorShop = shopParam || "unknown";
      return redirect(`/app?error=${encodeURIComponent(errorMessage)}&shop=${encodeURIComponent(errorShop)}`);
    }

    if (!code) {
      console.error(`[oauth] Missing authorization code`);
      const errorShop = shopParam || "unknown";
      return redirect(`/app?error=${encodeURIComponent("Missing authorization code")}&shop=${encodeURIComponent(errorShop)}`);
    }

    // Get shop from URL parameter (Meta redirects back without Shopify session)
    const targetShop = shopParam;
    if (!targetShop) {
      console.error(`[oauth] Missing shop parameter in callback URL`);
      return redirect(`/app?error=${encodeURIComponent("Missing shop parameter. Please try connecting again.")}`);
    }

    console.log(`[oauth] Processing callback for shop: ${targetShop}`);

    console.log(`[oauth] Exchanging code for access token for shop: ${targetShop}`);

    // Build redirect URI using production HTTPS URL (must match what was sent to Meta)
    // Ensure we use production URL, never tunnel URL
    // Use base URI without query parameters (Meta requires exact match)
    const finalAppUrl = APP_URL.includes('railway.app') ? APP_URL : PRODUCTION_URL;
        const redirectUri = `${finalAppUrl}/meta/instagram/callback`;
    
    console.log(`[oauth] Using finalAppUrl for callback: ${finalAppUrl}`);
    console.log(`[oauth] Redirect URI (base only): ${redirectUri}`);
    console.log(`[oauth] Shop from state parameter: ${targetShop}`);

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
      `client_id=${META_APP_ID}&` +
      `client_secret=${META_APP_SECRET}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code=${code}`;

    console.log(`[oauth] Token exchange URL: ${tokenUrl.replace(META_APP_SECRET, '***SECRET***')}`);
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();
    
    console.log(`[oauth] Token exchange response (full):`, JSON.stringify({
      ...tokenData,
      access_token: tokenData.access_token ? `${tokenData.access_token.substring(0, 20)}...` : null,
      // Check for any additional tokens or data
      has_graph_domain: !!tokenData.graph_domain,
      has_data_access_expires_at: !!tokenData.data_access_expires_at,
    }, null, 2));
    
    // Meta sometimes returns additional data in the token response
    if (tokenData.data) {
      console.log(`[oauth] Token response includes data field:`, JSON.stringify(tokenData.data, null, 2));
    }

    if (tokenData.error) {
      console.error(`[oauth] Token exchange error:`, tokenData.error);
      throw new Error(tokenData.error.message || "Failed to exchange authorization code");
    }

    const userAccessToken = tokenData.access_token;
    if (!userAccessToken) {
      console.error(`[oauth] No access token in response:`, tokenData);
      throw new Error("No access token received from Meta");
    }
    
    console.log(`[oauth] Access token obtained, expires in: ${tokenData.expires_in || 'unknown'} seconds`);
    console.log(`[oauth] Token type: ${tokenData.token_type || 'unknown'}`);
    console.log(`[oauth] Full access token: ${userAccessToken.substring(0, 50)}...`);

    // Get user's Facebook Pages
    console.log(`[oauth] Fetching user's Facebook Pages`);
    console.log(`[oauth] Using access token (first 20 chars): ${userAccessToken?.substring(0, 20)}...`);
    
    // First, verify the token works by calling /me
    console.log(`[oauth] Verifying token by calling /me endpoint`);
    let meData;
    try {
      meData = await metaGraphAPI("/me", userAccessToken);
      console.log(`[oauth] /me API response:`, JSON.stringify(meData, null, 2));
    } catch (meError) {
      console.error(`[oauth] /me API call failed:`, meError);
      console.error(`[oauth] This suggests the access token is invalid`);
      throw meError;
    }
    
    // Check token permissions - use app access token for debug_token
    // Extract Page ID and Instagram ID from granular_scopes (Meta provides these when using granular permissions)
    console.log(`[oauth] Checking token permissions to extract Page and Instagram IDs`);
    let pageId = null;
    let igBusinessId = null;
    
    try {
      // debug_token requires app access token (app_id|app_secret) as the access_token parameter
      const appAccessToken = `${META_APP_ID}|${META_APP_SECRET}`;
      const tokenInfo = await metaGraphAPI("/debug_token", appAccessToken, {
        params: {
          input_token: userAccessToken
        }
      });
      console.log(`[oauth] Token debug info:`, JSON.stringify(tokenInfo, null, 2));
      
      // Extract Page ID and Instagram ID from granular_scopes
      if (tokenInfo?.data?.granular_scopes) {
        for (const scope of tokenInfo.data.granular_scopes) {
          if (scope.scope === 'pages_show_list' && scope.target_ids && scope.target_ids.length > 0) {
            pageId = scope.target_ids[0]; // Use first Page ID
            console.log(`[oauth] ✅ Found Page ID from granular_scopes: ${pageId}`);
          }
          if (scope.scope === 'instagram_basic' && scope.target_ids && scope.target_ids.length > 0) {
            igBusinessId = scope.target_ids[0]; // Use first Instagram ID
            console.log(`[oauth] ✅ Found Instagram Business ID from granular_scopes: ${igBusinessId}`);
          }
        }
      }
    } catch (debugError) {
      console.warn(`[oauth] Could not debug token:`, debugError.message);
    }
    
    // If we have IDs from granular_scopes, use them directly
    // Otherwise, fall back to /me/accounts
    let pageAccessToken = null;
    let pageName = null;
    
    if (pageId && igBusinessId) {
      console.log(`[oauth] Using Page ID and Instagram ID from granular_scopes`);
      console.log(`[oauth] Page ID: ${pageId}, Instagram Business ID: ${igBusinessId}`);
      
      // Get Page info and access token by fetching the Page directly
      try {
        const pageInfo = await metaGraphAPI(`/${pageId}`, userAccessToken, {
          params: {
            fields: "id,name,access_token"
          }
        });
        console.log(`[oauth] Page info retrieved:`, JSON.stringify({
          id: pageInfo.id,
          name: pageInfo.name,
          has_access_token: !!pageInfo.access_token
        }, null, 2));
        
        pageAccessToken = pageInfo.access_token;
        pageName = pageInfo.name;
        
        if (!pageAccessToken) {
          console.error(`[oauth] Page access token not found in Page info`);
          // Try to get it from /me/accounts as fallback
        }
      } catch (pageError) {
        console.error(`[oauth] Error fetching Page info:`, pageError);
        // Fall through to /me/accounts
        pageId = null;
        igBusinessId = null;
      }
    }
    
    // Fallback: try /me/accounts if we didn't get data from granular_scopes
    if (!pageId || !pageAccessToken) {
      console.log(`[oauth] Falling back to /me/accounts`);
      let pagesData;
      try {
        pagesData = await metaGraphAPI("/me/accounts", userAccessToken, {
          params: {
            fields: "id,name,access_token,instagram_business_account"
          }
        });
        console.log(`[oauth] Pages API response:`, JSON.stringify(pagesData, null, 2));
        
        if (pagesData?.data && pagesData.data.length > 0) {
          const page = pagesData.data[0];
          pageId = page.id;
          pageAccessToken = page.access_token;
          pageName = page.name;
          
          // Get Instagram ID from Page if not already set
          if (!igBusinessId && page.instagram_business_account) {
            igBusinessId = page.instagram_business_account.id;
          } else if (!igBusinessId) {
            // Try fetching Instagram account from Page
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
        console.error(`[oauth] Error fetching Facebook Pages:`, apiError);
        return redirect(`/app/instagram?error=${encodeURIComponent(`Failed to fetch Facebook Pages: ${apiError.message}`)}&shop=${encodeURIComponent(targetShop)}`);
      }
    }
    
    // Validate we have all required data
    if (!pageId || !pageAccessToken) {
      console.error(`[oauth] Missing required data: pageId=${pageId}, hasPageToken=${!!pageAccessToken}`);
      return redirect(`/app/instagram?error=${encodeURIComponent("Could not retrieve Facebook Page information. Please ensure you grant the app access to your Page during OAuth.")}&shop=${encodeURIComponent(targetShop)}`);
    }
    
    if (!igBusinessId) {
      console.error(`[oauth] Instagram Business ID not found`);
      return redirect(`/app/instagram?error=${encodeURIComponent("No Instagram Business account found. Please link an Instagram Business account to your Facebook Page in Page settings.")}&shop=${encodeURIComponent(targetShop)}`);
    }

    console.log(`[oauth] ✅ Using Page: ${pageName || pageId} (ID: ${pageId})`);
    console.log(`[oauth] ✅ Instagram Business ID: ${igBusinessId}`);
    console.log(`[oauth] Instagram Business Account ID: ${igBusinessId}`);

    // Get long-lived token
    console.log(`[oauth] Exchanging for long-lived token`);
    const longLivedTokenUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${META_APP_ID}&` +
      `client_secret=${META_APP_SECRET}&` +
      `fb_exchange_token=${userAccessToken}`;

    const longLivedResponse = await fetch(longLivedTokenUrl);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error(`[oauth] Long-lived token exchange error:`, longLivedData.error);
      // Use short-lived token if long-lived exchange fails
      console.log(`[oauth] Using short-lived token instead`);
    }

    const finalUserToken = longLivedData.access_token || userAccessToken;
    const expiresAt = longLivedData.expires_in
      ? new Date(Date.now() + longLivedData.expires_in * 1000).toISOString()
      : null;

    console.log(`[oauth] Token expires at: ${expiresAt || 'unknown'}`);

    // Get shop from database
    const shopData = await getShopByDomain(targetShop);
    if (!shopData) {
      console.error(`[oauth] Shop not found in database: ${targetShop}`);
      return redirect(`/app/instagram?error=${encodeURIComponent("Shop not found")}`);
    }

    // Save Meta auth
    console.log(`[oauth] ========================================`);
    console.log(`[oauth] About to save Meta authentication data`);
    console.log(`[oauth] Shop: ${targetShop}`);
    console.log(`[oauth] Shop ID: ${shopData.id}`);
    console.log(`[oauth] Page ID: ${pageId}`);
    console.log(`[oauth] IG Business ID: ${igBusinessId}`);
    console.log(`[oauth] Token expires at: ${expiresAt || 'unknown'}`);
    console.log(`[oauth] User token length: ${finalUserToken?.length || 0}`);
    console.log(`[oauth] Page token length: ${pageAccessToken?.length || 0}`);
    
    try {
      const savedData = await saveMetaAuth(
        shopData.id,
        pageId,
        igBusinessId,
        finalUserToken,
        pageAccessToken,
        pageAccessToken, // Use page token for IG API calls
        expiresAt
      );
      console.log(`[oauth] ✅ Meta auth data saved successfully!`);
      console.log(`[oauth] Saved record ID: ${savedData?.id || 'unknown'}`);
      console.log(`[oauth] ========================================`);
    } catch (saveError) {
      console.error(`[oauth] ❌ ERROR saving Meta auth data`);
      console.error(`[oauth] Error type: ${saveError?.constructor?.name || 'Unknown'}`);
      console.error(`[oauth] Error message: ${saveError?.message || 'No message'}`);
      console.error(`[oauth] Error stack:`, saveError?.stack);
      console.error(`[oauth] ========================================`);
      throw saveError;
    }

    console.log(`[oauth] Instagram connection successful for shop: ${targetShop}`);
    console.log(`[oauth] ✅ Tokens saved successfully - Page ID: ${pageId}, IG Business ID: ${igBusinessId}`);
    
    // Redirect to Shopify admin app URL to trigger Shopify OAuth
    // After Meta OAuth, we need to restore the Shopify session
    // The best way is to redirect to Shopify's auth endpoint with the shop parameter
    const shopName = targetShop.replace('.myshopify.com', '');
    const appClientId = process.env.SHOPIFY_API_KEY || 'e8f65f3073d5d5a24b4654be248a0b56';
    
    // Redirect directly to Shopify admin app URL
    // This ensures we're in the Shopify admin context where authentication works
    const shopifyAdminAppUrl = `https://admin.shopify.com/store/${shopName}/apps/${appClientId}/app?connected=true`;
    
    console.log(`[oauth] Redirecting to Shopify admin app: ${shopifyAdminAppUrl}`);
    
    // Use HTTP 302 redirect - most reliable method
    // This will immediately redirect the browser without needing JavaScript
    return new Response(null, {
      status: 302,
      headers: {
        'Location': shopifyAdminAppUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error("[oauth] ========================================");
    console.error("[oauth] ERROR processing Instagram OAuth callback");
    console.error("[oauth] Error message:", error.message);
    console.error("[oauth] Error stack:", error.stack);
    console.error("[oauth] Request URL:", request.url);
    
    // Try to get shop from request URL for error redirect
    try {
      const errorUrl = new URL(request.url);
      const errorShop = errorUrl.searchParams.get("shop") || errorUrl.searchParams.get("state") || "unknown";
      console.error(`[oauth] Redirecting to error page with shop: ${errorShop}`);
      return redirect(`/app/instagram?error=${encodeURIComponent(error.message || "Unknown error")}&shop=${encodeURIComponent(errorShop)}`);
    } catch (redirectError) {
      console.error("[oauth] Failed to create error redirect:", redirectError);
      return redirect(`/app/instagram?error=${encodeURIComponent(error.message || "Unknown error")}`);
    }
  }
}

// Also handle POST requests (some OAuth flows use POST)
export const action = async ({ request }) => {
  console.log(`[oauth] Instagram OAuth callback received via POST`);
  // Redirect to loader to handle it
  return loader({ request });
}

// Default component (required for route to be recognized)
export default function InstagramCallback() {
  return null; // Loader handles everything, component is just a placeholder
}

