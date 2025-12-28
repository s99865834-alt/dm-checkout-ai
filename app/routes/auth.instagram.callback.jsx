import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
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
  console.log(`[oauth] Instagram OAuth callback received`);
  
  try {
    // Authenticate Shopify session
    const { shop } = await authenticate.admin(request);
    
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const shopParam = url.searchParams.get("shop") || url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorReason = url.searchParams.get("error_reason");
    const errorDescription = url.searchParams.get("error_description");

    // Handle OAuth errors
    if (error) {
      console.error(`[oauth] Instagram OAuth error:`, { error, errorReason, errorDescription });
      const errorMessage = errorDescription || errorReason || error;
      return redirect(`/app/instagram?error=${encodeURIComponent(errorMessage)}`);
    }

    if (!code) {
      console.error(`[oauth] Missing authorization code`);
      return redirect(`/app/instagram?error=${encodeURIComponent("Missing authorization code")}`);
    }

    const targetShop = shop || shopParam;
    if (!targetShop) {
      console.error(`[oauth] Missing shop parameter`);
      return redirect(`/app/instagram?error=${encodeURIComponent("Missing shop parameter")}`);
    }

    console.log(`[oauth] Exchanging code for access token for shop: ${targetShop}`);

    // Build redirect URI using production HTTPS URL (must match what was sent to Meta)
    // Ensure we use production URL, never tunnel URL
    const finalAppUrl = APP_URL.includes('railway.app') ? APP_URL : PRODUCTION_URL;
    const redirectUri = `${finalAppUrl}/auth/instagram/callback?shop=${encodeURIComponent(targetShop)}`;
    
    console.log(`[oauth] Using finalAppUrl for callback: ${finalAppUrl}`);
    console.log(`[oauth] Redirect URI: ${redirectUri}`);

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
      `client_id=${META_APP_ID}&` +
      `client_secret=${META_APP_SECRET}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error(`[oauth] Token exchange error:`, tokenData.error);
      throw new Error(tokenData.error.message || "Failed to exchange authorization code");
    }

    const userAccessToken = tokenData.access_token;
    console.log(`[oauth] Access token obtained, expires in: ${tokenData.expires_in || 'unknown'} seconds`);

    // Get user's Facebook Pages
    console.log(`[oauth] Fetching user's Facebook Pages`);
    const pagesData = await metaGraphAPI("/me/accounts", userAccessToken);
    
    if (!pagesData.data || pagesData.data.length === 0) {
      console.error(`[oauth] No Facebook Pages found`);
      return redirect(`/app/instagram?error=${encodeURIComponent("No Facebook Pages found. Please create a Page and link it to an Instagram Business account.")}`);
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
    console.log(`[oauth] Saving Meta authentication data`);
    await saveMetaAuth(
      shopData.id,
      pageId,
      igBusinessId,
      finalUserToken,
      pageAccessToken,
      pageAccessToken, // Use page token for IG API calls
      expiresAt
    );

    console.log(`[oauth] Instagram connection successful for shop: ${targetShop}`);
    return redirect("/app/instagram?connected=true");
  } catch (error) {
    console.error("[oauth] Error processing Instagram OAuth callback:", error);
    console.error("[oauth] Error stack:", error.stack);
    return redirect(`/app/instagram?error=${encodeURIComponent(error.message || "Unknown error")}`);
  }
}

