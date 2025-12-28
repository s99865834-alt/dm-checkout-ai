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
      return redirect(`/app/instagram?error=${encodeURIComponent(errorMessage)}&shop=${encodeURIComponent(errorShop)}`);
    }

    if (!code) {
      console.error(`[oauth] Missing authorization code`);
      const errorShop = shopParam || "unknown";
      return redirect(`/app/instagram?error=${encodeURIComponent("Missing authorization code")}&shop=${encodeURIComponent(errorShop)}`);
    }

    // Get shop from URL parameter (Meta redirects back without Shopify session)
    const targetShop = shopParam;
    if (!targetShop) {
      console.error(`[oauth] Missing shop parameter in callback URL`);
      return redirect(`/app/instagram?error=${encodeURIComponent("Missing shop parameter. Please try connecting again.")}`);
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
    console.log(`[oauth] Checking token permissions`);
    try {
      // debug_token requires app access token (app_id|app_secret) as the access_token parameter
      const appAccessToken = `${META_APP_ID}|${META_APP_SECRET}`;
      const tokenInfo = await metaGraphAPI("/debug_token", appAccessToken, {
        params: {
          input_token: userAccessToken
        }
      });
      console.log(`[oauth] Token debug info:`, JSON.stringify(tokenInfo, null, 2));
    } catch (debugError) {
      console.warn(`[oauth] Could not debug token:`, debugError.message);
    }
    
    // Check what permissions the token actually has
    console.log(`[oauth] Checking granted permissions`);
    try {
      const permissions = await metaGraphAPI("/me/permissions", userAccessToken);
      console.log(`[oauth] User permissions:`, JSON.stringify(permissions, null, 2));
      
      // Check specifically for pages permissions
      const pagesPerms = permissions?.data?.filter(p => p.permission?.includes('pages') || p.permission?.includes('page'));
      console.log(`[oauth] Pages-related permissions:`, JSON.stringify(pagesPerms, null, 2));
    } catch (permError) {
      console.warn(`[oauth] Could not fetch permissions:`, permError.message);
    }
    
    let pagesData;
    try {
      // Try fetching pages - use endpoint without query params, pass fields via options
      console.log(`[oauth] Now fetching pages with /me/accounts`);
      pagesData = await metaGraphAPI("/me/accounts", userAccessToken, {
        params: {
          fields: "id,name,access_token,instagram_business_account"
        }
      });
      console.log(`[oauth] Pages API response:`, JSON.stringify(pagesData, null, 2));
      
      // If that fails, try without fields parameter
      if (!pagesData || !pagesData.data) {
        console.log(`[oauth] Trying /me/accounts without fields parameter`);
        pagesData = await metaGraphAPI("/me/accounts", userAccessToken);
        console.log(`[oauth] Pages API response (no fields):`, JSON.stringify(pagesData, null, 2));
      }
    } catch (apiError) {
      console.error(`[oauth] Error fetching Facebook Pages:`, apiError);
      console.error(`[oauth] Error details:`, {
        message: apiError.message,
        stack: apiError.stack
      });
      return redirect(`/app/instagram?error=${encodeURIComponent(`Failed to fetch Facebook Pages: ${apiError.message}`)}&shop=${encodeURIComponent(targetShop)}`);
    }
    
    if (!pagesData || !pagesData.data || pagesData.data.length === 0) {
      console.error(`[oauth] No Facebook Pages found`);
      console.error(`[oauth] Pages data response:`, JSON.stringify(pagesData, null, 2));
      console.error(`[oauth] This might mean:`);
      console.error(`[oauth] 1. The user hasn't granted the app access to their Pages`);
      console.error(`[oauth] 2. The user needs to select the Page during OAuth`);
      console.error(`[oauth] 3. The access token doesn't have the right permissions`);
      return redirect(`/app/instagram?error=${encodeURIComponent("No Facebook Pages found. Please make sure you grant the app access to your Facebook Page during the OAuth flow, and that your Instagram account is linked to the Page.")}&shop=${encodeURIComponent(targetShop)}`);
    }

    console.log(`[oauth] Found ${pagesData.data.length} Facebook Page(s)`);

    // For now, use the first page (you can add a selection UI later)
    // TODO: Add Page selection UI for merchants with multiple Pages
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;
    const pageId = page.id;

    console.log(`[oauth] Using Page: ${page.name} (ID: ${pageId})`);

    // Get Instagram Business Account linked to this Page
    console.log(`[oauth] Fetching Instagram Business Account for Page`);
    const igAccountData = await metaGraphAPI(
      `/${pageId}?fields=instagram_business_account`,
      pageAccessToken
    );

    if (!igAccountData.instagram_business_account) {
      console.error(`[oauth] No Instagram Business account linked to Page`);
      return redirect(`/app/instagram?error=${encodeURIComponent("No Instagram Business account linked to this Facebook Page. Please link an Instagram Business account in Facebook Page settings.")}`);
    }

    const igBusinessId = igAccountData.instagram_business_account.id;
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
    
    // Redirect to root with shop parameter - this will trigger Shopify OAuth
    // The _index route will handle the redirect to /app after OAuth
    // We'll pass connected=true so the app knows to show success message
    const shopifyAuthUrl = `${finalAppUrl}/?shop=${encodeURIComponent(targetShop)}&instagram_connected=true`;
    
    console.log(`[oauth] Redirecting to root with shop parameter: ${shopifyAuthUrl}`);
    console.log(`[oauth] This will trigger Shopify OAuth, then redirect to app`);
    
    // Return HTML that redirects to Shopify auth
    // This will trigger Shopify OAuth, then redirect to the app
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>Instagram Connected - Authenticating with Shopify...</title>
  <meta http-equiv="refresh" content="2;url=${shopifyAuthUrl}">
  <script>
    setTimeout(function() {
      window.location.href = ${JSON.stringify(shopifyAuthUrl)};
    }, 1000);
  </script>
</head>
<body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #28a745;">✅ Instagram Connected Successfully!</h1>
  <p style="font-size: 18px; margin: 20px 0;">Your Instagram Business account has been connected.</p>
  <p style="color: #666; margin: 30px 0;">
    Authenticating with Shopify...
  </p>
  <p style="color: #999; font-size: 12px; margin-top: 20px;">
    Redirecting automatically in 2 seconds...
  </p>
</body>
</html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
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

