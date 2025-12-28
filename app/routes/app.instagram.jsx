import { useOutletContext, useRouteError, useSearchParams, useLoaderData, useFetcher } from "react-router";
import { useEffect } from "react";
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
    // This must match the redirect URI configured in Meta App Dashboard
    // Even in local dev, we use production URL because Meta only allows whitelisted URIs
    // Hardcode production URL to prevent tunnel URL from being used
    const PRODUCTION_URL = "https://dm-checkout-ai-production.up.railway.app";
    const APP_URL = process.env.SHOPIFY_APP_URL || process.env.APP_URL || PRODUCTION_URL;
    
    // Ensure we always use production URL, never tunnel URL
    const finalAppUrl = APP_URL.includes('railway.app') ? APP_URL : PRODUCTION_URL;
    
    if (!finalAppUrl || !finalAppUrl.startsWith('https://')) {
      console.error("[oauth] Invalid APP_URL configuration");
      console.error("[oauth] SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL);
      console.error("[oauth] APP_URL:", process.env.APP_URL);
      console.error("[oauth] Using fallback:", PRODUCTION_URL);
      return { error: "Server configuration error. Please contact support." };
    }
    
    // Force production URL - never use local tunnel URL for OAuth redirects
    // Use base URI without query parameters (Meta requires exact match)
    // Shop domain is passed via 'state' parameter (standard OAuth pattern)
        const redirectUri = `${finalAppUrl}/meta/instagram/callback`;
    
    // Log for debugging
    console.log(`[oauth] Using finalAppUrl: ${finalAppUrl}`);
    console.log(`[oauth] Redirect URI (base only): ${redirectUri}`);
    console.log(`[oauth] Shop domain in state: ${shopDomain}`);
    
    const scopes = [
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement", // Required to read page data
      "pages_manage_metadata",
      "instagram_manage_comments",
      "instagram_manage_messages",
    ].join(",");

    const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?` +
      `client_id=${META_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_type=code&` +
      `auth_type=rerequest&` + // Force re-prompting of permissions
      `state=${encodeURIComponent(shopDomain)}`;

    console.log(`[oauth] OAuth URL generated for shop: ${shopDomain}`);
    console.log(`[oauth] APP_URL: ${APP_URL}`);
    console.log(`[oauth] Redirect URI: ${redirectUri}`);
    console.log(`[oauth] Full OAuth URL: ${authUrl}`);
    return { oauthUrl: authUrl };
  } catch (error) {
    console.error("[oauth] Error generating OAuth URL:", error);
    return { error: error.message || "Failed to initiate Instagram connection" };
  }
};

export default function InstagramPage() {
  const loaderData = useLoaderData();
  const { shop, plan, metaAuth, instagramInfo } = loaderData || {};
  const { hasAccess, isFree, isGrowth, isPro } = usePlanAccess();
  const [searchParams] = useSearchParams();
  const connected = searchParams.get("connected") === "true";
  const disconnected = searchParams.get("disconnected") === "true";
  const error = searchParams.get("error");
  const isConnected = !!metaAuth;
  const fetcher = useFetcher();

  // Handle OAuth URL redirect - break out of iframe for external OAuth
  useEffect(() => {
    if (fetcher.data?.oauthUrl) {
      // Use window.top to break out of the embedded app iframe
      // This is required for OAuth flows in embedded Shopify apps
      try {
        window.top.location.href = fetcher.data.oauthUrl;
      } catch (e) {
        // Fallback if window.top is not accessible (shouldn't happen in embedded apps)
        window.location.href = fetcher.data.oauthUrl;
      }
    } else if (fetcher.data?.error) {
      window.location.href = `/app/instagram?error=${encodeURIComponent(fetcher.data.error)}`;
    } else if (fetcher.data?.success) {
      // Reload page after successful disconnect
      window.location.href = `/app/instagram?disconnected=true`;
    }
  }, [fetcher.data]);

  return (
    <s-page heading="Instagram Feed">
      {shop && plan && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
              {plan.name} Plan
            </s-badge>
          </s-stack>
        </s-section>
      )}

      {/* Connect Instagram Section */}
      <s-section heading="Instagram Connection">
        <s-stack direction="block" gap="base">
          {error && (
            <s-banner tone="critical">
              <s-text variant="strong">Connection Error</s-text>
              <s-text>{error}</s-text>
            </s-banner>
          )}
          
          {connected && !error && (
            <s-banner tone="success">
              <s-text variant="strong">Successfully Connected!</s-text>
              <s-text>Your Instagram Business account is now connected.</s-text>
            </s-banner>
          )}
          
          {disconnected && !error && (
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
              <s-stack direction="inline" gap="base">
                <s-button 
                  variant="secondary" 
                  onClick={() => {
                    fetcher.submit({}, { method: "post" });
                  }}
                  disabled={fetcher.state !== "idle"}
                >
                  {fetcher.state !== "idle" ? "Connecting..." : "Reconnect Instagram"}
                </s-button>
                <s-button 
                  variant="tertiary" 
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

      {/* DM Automation - Available to all plans */}
      <s-section heading="DM Automation">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Automatically respond to Instagram DMs with AI-powered product recommendations and checkout links.
          </s-paragraph>
          <s-paragraph>
            <s-text variant="subdued">
              Status: {plan?.dm ? "Enabled" : "Disabled"}
            </s-text>
          </s-paragraph>
        </s-stack>
      </s-section>

      {/* Comments Automation - Growth+ */}
      <PlanGate requiredPlan="GROWTH" feature="Comments Automation">
        <s-section heading="Comments Automation">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Automatically respond to Instagram comments with private DMs containing product recommendations and checkout links.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.comments ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Comments</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Conversations - Growth+ */}
      <PlanGate requiredPlan="GROWTH" feature="Conversational AI">
        <s-section heading="Conversational AI">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Engage in multi-message conversations with customers, answering questions and providing personalized recommendations.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.converse ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Conversations</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Brand Voice - Growth+ */}
      <PlanGate requiredPlan="GROWTH" feature="Brand Voice">
        <s-section heading="Brand Voice Customization">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Customize the tone and style of AI responses to match your brand personality.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.brandVoice ? "Available" : "Not Available"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Brand Voice</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Follow-ups - Pro only */}
      <PlanGate requiredPlan="PRO" feature="Follow-up Automation">
        <s-section heading="Follow-up Automation">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Automatically send follow-up messages to customers who haven't converted within 23 hours.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.followup ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Follow-ups</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Remarketing - Pro only */}
      <PlanGate requiredPlan="PRO" feature="Remarketing">
        <s-section heading="Remarketing">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Engage users who haven't converted with follow-ups and email capture for remarketing campaigns.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.remarketing ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Setup Remarketing</s-button>
          </s-stack>
        </s-section>
      </PlanGate>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
  