import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Success page after Instagram OAuth
 * This route handles the redirect after Meta OAuth completes
 * It triggers Shopify OAuth if needed, then redirects to Instagram page
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (!shop) {
    return redirect("/auth/login");
  }
  
  console.log(`[oauth] Success route - shop: ${shop}`);
  
  // Try to authenticate first
  try {
    await authenticate.admin(request);
    // If authenticated, redirect to Instagram page
    console.log(`[oauth] Already authenticated, redirecting to Instagram page`);
    return redirect(`/app?connected=true&shop=${encodeURIComponent(shop)}`);
  } catch (error) {
    // Not authenticated - redirect to our auth endpoint
    // This will trigger Shopify OAuth through our app's auth flow
    console.log(`[oauth] Not authenticated, redirecting to auth endpoint`);
    const url = new URL(request.url);
    const appUrl = url.origin;
    // Redirect to /auth with shop parameter - this will trigger Shopify OAuth
    // After OAuth, Shopify redirects back to /app, and app._index will detect Instagram connection
    return redirect(`${appUrl}/auth?shop=${encodeURIComponent(shop)}`);
  }
};

// Default component (required for route to be recognized)
// This component is never rendered since loader always redirects
export default function InstagramSuccess() {
  return null;
}

