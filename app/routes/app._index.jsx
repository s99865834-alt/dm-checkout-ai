import { useEffect } from "react";
import { useFetcher, useOutletContext, useSearchParams, useNavigate, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth, getInstagramAccountInfo, deleteMetaAuth } from "../lib/meta.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";

const META_APP_ID = process.env.META_APP_ID;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);
  
  // Check if Instagram is connected
  let metaAuth = null;
  let instagramInfo = null;
  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);
    
    // If connected, fetch Instagram account info
    if (metaAuth?.ig_business_id && metaAuth?.page_access_token) {
      instagramInfo = await getInstagramAccountInfo(
        metaAuth.ig_business_id,
        metaAuth.page_access_token
      );
    }
  }
  
  return { shop, plan, metaAuth, instagramInfo };
};

export const action = async ({ request }) => {
  try {
    // Authenticate and get shop domain from session
    const { session } = await authenticate.admin(request);
    
    if (!session || !session.shop) {
      return { error: "Authentication failed. Please try again." };
    }

    const formData = await request.formData();
    const actionType = formData.get("action");
    
    // Handle disconnect action
    if (actionType === "disconnect") {
      const { shop } = await getShopWithPlan(request);
      if (!shop?.id) {
        return { error: "Shop not found" };
      }
      
      await deleteMetaAuth(shop.id);
      return { success: true, message: "Instagram account disconnected successfully" };
    }
    
    // Handle connect action (existing OAuth flow)
    const shopDomain = session.shop;
    
    // ALWAYS use production HTTPS URL for OAuth redirect (Facebook requires HTTPS)
    const PRODUCTION_URL = "https://dm-checkout-ai-production.up.railway.app";
    const APP_URL = process.env.SHOPIFY_APP_URL || process.env.APP_URL || PRODUCTION_URL;
    const finalAppUrl = APP_URL.includes('railway.app') ? APP_URL : PRODUCTION_URL;
    
    if (!finalAppUrl || !finalAppUrl.startsWith('https://')) {
      console.error("[oauth] Invalid APP_URL configuration");
      return { error: "Server configuration error. Please contact support." };
    }
    
    const redirectUri = `${finalAppUrl}/meta/instagram/callback`;
    
    const scopes = [
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_metadata",
      "instagram_manage_comments",
      "instagram_manage_messages",
    ].join(",");

    const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?` +
      `client_id=${META_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_type=code&` +
      `auth_type=rerequest&` +
      `state=${encodeURIComponent(shopDomain)}`;

    return { oauthUrl: authUrl };
  } catch (error) {
    console.error("[oauth] Error generating OAuth URL:", error);
    return { error: error.message || "Failed to initiate Instagram connection" };
  }
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const loaderData = useLoaderData();
  const { shop, plan, metaAuth, instagramInfo } = loaderData || {};
  const { hasAccess } = usePlanAccess();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const disconnected = searchParams.get("disconnected") === "true";
  const error = searchParams.get("error");
  const isConnected = !!metaAuth;

  // Handle OAuth URL redirect - break out of iframe for external OAuth
  useEffect(() => {
    if (fetcher.data?.oauthUrl) {
      try {
        window.top.location.href = fetcher.data.oauthUrl;
      } catch (e) {
        window.location.href = fetcher.data.oauthUrl;
      }
    } else if (fetcher.data?.error) {
      navigate(`/app?error=${encodeURIComponent(fetcher.data.error)}`);
    } else if (fetcher.data?.success) {
      navigate(`/app?disconnected=true`);
    }
  }, [fetcher.data, navigate]);

  return (
    <s-page heading="DM Checkout AI">
      {shop && plan && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
              {plan.name} Plan
            </s-badge>
            {plan.name === "FREE" && shop.usage_count !== undefined && (
              <s-text variant="subdued">
                Usage: {shop.usage_count}/{plan.cap} messages this month
              </s-text>
            )}
          </s-stack>
        </s-section>
      )}
      {/* Instagram Connection Section */}
      <s-section heading="Instagram Connection">
        <s-stack direction="block" gap="base">
          {error && (
            <s-banner tone="critical">
              <s-text variant="strong">Connection Error</s-text>
              <s-text>{error}</s-text>
            </s-banner>
          )}
          
          {disconnected && !error && !isConnected && (
            <s-banner tone="info">
              <s-text variant="strong">Disconnected</s-text>
              <s-text>Your Instagram Business account has been disconnected.</s-text>
            </s-banner>
          )}

          {isConnected ? (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text variant="strong">Status: Connected</s-text>
              </s-paragraph>
              {instagramInfo?.username && (
                <s-paragraph>
                  <s-text variant="strong">Instagram Username: </s-text>
                  <s-text>@{instagramInfo.username}</s-text>
                </s-paragraph>
              )}
              {instagramInfo?.mediaCount !== undefined && (
                <s-paragraph>
                  <s-text variant="strong">Number of Posts: </s-text>
                  <s-text>{instagramInfo.mediaCount}</s-text>
                </s-paragraph>
              )}
              <s-paragraph>
                <s-text variant="subdued">
                  Instagram Business Account ID: {metaAuth.ig_business_id}
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">
                  Facebook Page ID: {metaAuth.page_id}
                </s-text>
              </s-paragraph>
              {metaAuth.token_expires_at && (
                <s-paragraph>
                  <s-text variant="subdued">
                    Token expires: {new Date(metaAuth.token_expires_at).toLocaleDateString()}
                  </s-text>
                </s-paragraph>
              )}
              <s-button 
                variant="secondary" 
                onClick={() => {
                  if (confirm("Are you sure you want to disconnect your Instagram account? You'll need to reconnect to use Instagram features.")) {
                    fetcher.submit({ action: "disconnect" }, { method: "post" });
                  }
                }}
                disabled={fetcher.state !== "idle"}
              >
                {fetcher.state !== "idle" ? "Disconnecting..." : "Disconnect Instagram"}
              </s-button>
            </s-stack>
          ) : (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Connect your Instagram Business account to enable automation features.
              </s-paragraph>
              <s-banner tone="info">
                <s-text variant="strong">Why Facebook Page access?</s-text>
                <s-text>
                  Meta requires Instagram Business accounts to be linked to a Facebook Page. 
                  When you connect, you'll be asked to grant access to your Facebook Page - 
                  this is just a technical requirement. We only use it to access your Instagram Business account.
                </s-text>
              </s-banner>
              <s-paragraph>
                <s-text variant="subdued">
                  Requirements: You need a Facebook Page with a linked Instagram Business account.
                </s-text>
              </s-paragraph>
              <s-button 
                variant="primary"
                onClick={() => {
                  fetcher.submit({}, { method: "post" });
                }}
                disabled={fetcher.state !== "idle"}
              >
                {fetcher.state !== "idle" ? "Connecting..." : "Connect Instagram Business Account"}
              </s-button>
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
