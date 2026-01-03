import { useEffect, useState } from "react";
import { useFetcher, useOutletContext, useSearchParams, useNavigate, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth, getInstagramAccountInfo, deleteMetaAuth } from "../lib/meta.server";
import { getSettings, updateSettings } from "../lib/db.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";

const META_APP_ID = process.env.META_APP_ID;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);
  
  // Check if Instagram is connected
  let metaAuth = null;
  let instagramInfo = null;
  let settings = null;
  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);
    settings = await getSettings(shop.id);
    
    // If connected, fetch Instagram account info (with automatic token refresh)
    if (metaAuth?.ig_business_id && shop?.id) {
      instagramInfo = await getInstagramAccountInfo(
        metaAuth.ig_business_id,
        shop.id
      );
    }
  }
  
  return { shop, plan, metaAuth, instagramInfo, settings };
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
    
    // Handle automation settings update
    if (actionType === "update-automation-settings") {
      const { shop } = await getShopWithPlan(request);
      if (!shop?.id) {
        return { error: "Shop not found" };
      }

      const dmAutomationEnabled = formData.get("dm_automation_enabled") === "true";
      const commentAutomationEnabled = formData.get("comment_automation_enabled") === "true";

      try {
        await updateSettings(shop.id, {
          dm_automation_enabled: dmAutomationEnabled,
          comment_automation_enabled: commentAutomationEnabled,
          // Note: enabled_post_ids is now managed on the Instagram Feed page
        });

        return { success: true, message: "Settings updated successfully" };
      } catch (error) {
        console.error("[home] Error updating settings:", error);
        return { error: error.message || "Failed to update settings" };
      }
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
  const { shop, plan, metaAuth, instagramInfo, settings } = loaderData || {};
  const { hasAccess } = usePlanAccess();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const disconnected = searchParams.get("disconnected") === "true";
  const error = searchParams.get("error");
  const isConnected = !!metaAuth;

  const [dmAutomationEnabled, setDmAutomationEnabled] = useState(settings?.dm_automation_enabled ?? true);
  const [commentAutomationEnabled, setCommentAutomationEnabled] = useState(settings?.comment_automation_enabled ?? true);

  // Update local state when settings change (e.g., on initial load or after page refresh)
  useEffect(() => {
    if (settings) {
      setDmAutomationEnabled(settings.dm_automation_enabled ?? true);
      setCommentAutomationEnabled(settings.comment_automation_enabled ?? true);
    }
  }, [settings]);

  // Handle OAuth URL redirect - break out of iframe for external OAuth
  useEffect(() => {
    if (fetcher.data?.oauthUrl) {
      try {
        window.top.location.href = fetcher.data.oauthUrl;
      } catch (e) {
        window.location.href = fetcher.data.oauthUrl;
      }
    } else if (fetcher.data?.error && !fetcher.data?.oauthUrl) {
      // Only navigate on OAuth/connection errors, not on automation settings errors
      // Automation settings errors will just show the banner
      if (fetcher.data.error.includes("Instagram") || fetcher.data.error.includes("connection") || fetcher.data.error.includes("OAuth")) {
        navigate(`/app?error=${encodeURIComponent(fetcher.data.error)}`);
      }
    } else if (fetcher.data?.success && fetcher.data?.message?.includes("disconnected")) {
      // Only navigate on disconnect success, not on automation settings success
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

      {/* Automation Controls Section */}
      <PlanGate requiredPlan="PRO" feature="Automation Controls">
        <s-section heading="Automation Controls">
          <s-paragraph>
            Control which types of messages are automatically processed and responded to.
          </s-paragraph>

          <fetcher.Form method="post">
            <input type="hidden" name="action" value="update-automation-settings" />
            <input type="hidden" name="dm_automation_enabled" value={dmAutomationEnabled ? "true" : "false"} />
            <input type="hidden" name="comment_automation_enabled" value={commentAutomationEnabled ? "true" : "false"} />
            <s-stack direction="block" gap="base">
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong">DM Automation</s-text>
                      <s-text variant="subdued">
                        Automatically process and respond to Instagram Direct Messages
                      </s-text>
                    </s-stack>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={dmAutomationEnabled}
                        onChange={(e) => setDmAutomationEnabled(e.target.checked)}
                        style={{ width: "20px", height: "20px", cursor: "pointer" }}
                      />
                    </label>
                  </s-stack>
                </s-stack>
              </s-box>

              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong">Comment Automation</s-text>
                      <s-text variant="subdued">
                        Automatically process and respond to Instagram comments
                      </s-text>
                    </s-stack>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={commentAutomationEnabled}
                        onChange={(e) => setCommentAutomationEnabled(e.target.checked)}
                        style={{ width: "20px", height: "20px", cursor: "pointer" }}
                      />
                    </label>
                  </s-stack>
                </s-stack>
              </s-box>

              <s-button type="submit" variant="primary" disabled={fetcher.state !== "idle"}>
                {fetcher.state === "submitting" ? "Saving..." : "Save Settings"}
              </s-button>
            </s-stack>
          </fetcher.Form>
        </s-section>
      </PlanGate>

      {/* Success/Error Messages */}
      {fetcher.data?.success && (
        <s-banner tone="success">
          <s-text>{fetcher.data.message}</s-text>
        </s-banner>
      )}

      {fetcher.data?.error && (
        <s-banner tone="critical">
          <s-text>{fetcher.data.error}</s-text>
        </s-banner>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
