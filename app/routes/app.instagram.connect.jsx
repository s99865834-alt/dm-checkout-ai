import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

const META_APP_ID = process.env.META_APP_ID;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

/**
 * Instagram OAuth Initiation
 * Redirects merchant to Meta's OAuth flow
 */
export async function loader({ request }) {
  try {
    // Authenticate Shopify session and get shop domain directly from session
    const { session } = await authenticate.admin(request);
    
    if (!session || !session.shop) {
      console.error("[oauth] No session or shop found");
      return redirect(`/app/instagram?error=${encodeURIComponent("Authentication failed. Please try again.")}`);
    }

    const shopDomain = session.shop;

    // Build redirect URI using the current request URL origin
    // This works for both local dev (tunnel) and production
    const url = new URL(request.url);
    const origin = url.origin;
    const redirectUri = `${origin}/auth/instagram/callback?shop=${encodeURIComponent(shopDomain)}`;
    
    const scopes = [
      "instagram_business_basic",
      "pages_show_list",
      "pages_manage_metadata",
      "instagram_manage_comments",
      "instagram_business_manage_messages",
    ].join(",");

    const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?` +
      `client_id=${META_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_type=code&` +
      `state=${encodeURIComponent(shopDomain)}`;

    console.log(`[oauth] Initiating Instagram OAuth for shop: ${shopDomain}`);
    console.log(`[oauth] Redirect URI: ${redirectUri}`);
    return redirect(authUrl);
  } catch (error) {
    console.error("[oauth] Error initiating Instagram OAuth:", error);
    console.error("[oauth] Error stack:", error.stack);
    return redirect(`/app/instagram?error=${encodeURIComponent(error.message || "Failed to initiate Instagram connection")}`);
  }
}

