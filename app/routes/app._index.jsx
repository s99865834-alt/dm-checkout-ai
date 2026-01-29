import { useEffect, useState } from "react";
import { useFetcher, useOutletContext, useSearchParams, useNavigate, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth, getInstagramAccountInfo, deleteMetaAuth, checkWebhookStatus } from "../lib/meta.server";
import { getSettings, updateSettings, getBrandVoice, updateBrandVoice } from "../lib/db.server";
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
  let brandVoice = null;
  let webhookStatus = null;
  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);
    settings = await getSettings(shop.id);
    brandVoice = await getBrandVoice(shop.id);
    
    // If connected, fetch Instagram account info (with automatic token refresh)
    if (metaAuth?.ig_business_id && shop?.id) {
      instagramInfo = await getInstagramAccountInfo(
        metaAuth.ig_business_id,
        shop.id
      );
      
      // Check webhook subscription status (Facebook Login only; Instagram Login uses dashboard)
      if (metaAuth.page_id && metaAuth.auth_type !== "instagram") {
        webhookStatus = await checkWebhookStatus(shop.id, metaAuth.page_id);
      } else if (metaAuth.auth_type === "instagram") {
        webhookStatus = { subscribed: null, note: "Instagram Login: configure webhooks in Meta App Dashboard" };
      }
    }
  }
  
  return { shop, plan, metaAuth, instagramInfo, settings, brandVoice, webhookStatus };
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
    
    console.log("[home] Action called with actionType:", actionType);
    
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
      console.log("[home] Processing update-automation-settings action");
      const { shop, plan } = await getShopWithPlan(request);
      if (!shop?.id) {
        console.error("[home] Shop not found");
        return { error: "Shop not found" };
      }

      const dmAutomationEnabled = formData.get("dm_automation_enabled") === "true";
      const commentAutomationEnabled = formData.get("comment_automation_enabled") === "true";
      const followupEnabled = formData.get("followup_enabled") === "true";
      const brandVoiceTone = formData.get("brand_voice_tone") || null;
      const brandVoiceCustom = formData.get("brand_voice_custom") || "";

      console.log("[home] Form data:", {
        dmAutomationEnabled,
        commentAutomationEnabled,
        brandVoiceTone,
        brandVoiceCustom,
      });

      try {
        // Update settings
        console.log("[home] Updating settings...");
        await updateSettings(shop.id, {
          dm_automation_enabled: dmAutomationEnabled,
          comment_automation_enabled: commentAutomationEnabled,
          followup_enabled: followupEnabled,
          // Note: enabled_post_ids is now managed on the Instagram Feed page
        });
        console.log("[home] Settings updated successfully");

        // Update brand voice in brand_voice table
        const brandVoice = {
          tone: brandVoiceTone || "friendly", // Default to friendly if not set
          custom_instruction: brandVoiceCustom && brandVoiceCustom.trim() ? brandVoiceCustom.trim() : null,
        };

        console.log("[home] Updating brand voice...", brandVoice);
        await updateBrandVoice(shop.id, brandVoice);
        console.log("[home] Brand voice updated successfully");

        console.log("[home] Settings and brand voice updated successfully");
        return { success: true, message: "Settings updated successfully" };
      } catch (error) {
        console.error("[home] Error updating settings:", error);
        console.error("[home] Error stack:", error.stack);
        return { error: error.message || "Failed to update settings" };
      }
    }
    
    // Handle connect action (OAuth flow) – Facebook Login or Instagram Login
    const shopDomain = session.shop;
    const connectType = formData.get("connectType") || "facebook";

    const PRODUCTION_URL = "https://dm-checkout-ai-production.up.railway.app";
    const APP_URL = process.env.SHOPIFY_APP_URL || process.env.APP_URL || PRODUCTION_URL;
    const finalAppUrl = APP_URL.includes("railway.app") ? APP_URL : PRODUCTION_URL;

    if (!finalAppUrl || !finalAppUrl.startsWith("https://")) {
      console.error("[oauth] Invalid APP_URL configuration");
      return { error: "Server configuration error. Please contact support." };
    }

    // Instagram Login (Business Login) – no Facebook Page required
    // Must use the Instagram App ID from Meta Dashboard (Business login settings), not the main Facebook App ID.
    if (connectType === "instagram-login") {
      const instagramAppId = process.env.META_INSTAGRAM_APP_ID;
      if (!instagramAppId) {
        return {
          error: "Instagram Login is not configured. Set META_INSTAGRAM_APP_ID (and META_INSTAGRAM_APP_SECRET) from Meta App Dashboard → Instagram → API setup with Instagram login → Set up Instagram business login → Business login settings → Instagram App ID. The main Facebook App ID cannot be used for Instagram Login.",
        };
      }
      const redirectUri = `${finalAppUrl}/meta/instagram-login/callback`;
      const scopes = [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
      ].join(",");
      const authUrl = `https://www.instagram.com/oauth/authorize?` +
        `client_id=${instagramAppId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${encodeURIComponent(shopDomain)}`;
      return { oauthUrl: authUrl };
    }

    // Facebook Login (default) – requires Facebook Page linked to IG Business
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
  const { shop, plan, metaAuth, instagramInfo, settings, brandVoice, webhookStatus } = loaderData || {};
  const { hasAccess } = usePlanAccess();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const disconnected = searchParams.get("disconnected") === "true";
  const error = searchParams.get("error");
  const isConnected = !!metaAuth;
  
  // Use separate fetchers for different actions to avoid conflicts
  const automationFetcher = useFetcher();
  const instagramFetcher = useFetcher();

  const [dmAutomationEnabled, setDmAutomationEnabled] = useState(settings?.dm_automation_enabled ?? true);
  const [commentAutomationEnabled, setCommentAutomationEnabled] = useState(settings?.comment_automation_enabled ?? true);
  const [followupEnabled, setFollowupEnabled] = useState(settings?.followup_enabled ?? false);
  const [brandVoiceTone, setBrandVoiceTone] = useState(brandVoice?.tone || "friendly");
  const [brandVoiceCustom, setBrandVoiceCustom] = useState(brandVoice?.custom_instruction || "");

  // Update local state when settings change (e.g., on initial load or after page refresh)
  useEffect(() => {
      if (settings) {
        setDmAutomationEnabled(settings.dm_automation_enabled ?? true);
        setCommentAutomationEnabled(settings.comment_automation_enabled ?? true);
        setFollowupEnabled(settings.followup_enabled ?? false);
      }
    if (brandVoice) {
      setBrandVoiceTone(brandVoice.tone || "friendly");
      setBrandVoiceCustom(brandVoice.custom_instruction || "");
    }
  }, [settings, brandVoice]);

  // Update state after successful submission (don't reload page)
  useEffect(() => {
    if (automationFetcher.data?.success) {
      // State will be updated from loader data on next render
      // No need to reload - the success message will show
      console.log("Settings saved successfully");
    }
  }, [automationFetcher.data]);

  // Debug: Log fetcher state and data
  useEffect(() => {
    console.log("Automation fetcher state:", automationFetcher.state);
    if (automationFetcher.data) {
      console.log("Automation fetcher data:", automationFetcher.data);
    }
  }, [automationFetcher.state, automationFetcher.data]);

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
  
  // Handle Instagram connection success/error (OAuth)
  useEffect(() => {
    if (instagramFetcher.data?.error) {
      // Show error in URL params for display
      navigate(`/app?error=${encodeURIComponent(instagramFetcher.data.error)}`);
    }
  }, [instagramFetcher.data, navigate]);

  return (
    <s-page heading="DM Checkout AI">
      {shop && plan && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
              {plan.name} Plan
            </s-badge>
            {plan.name === "FREE" && shop.usage_count !== undefined && (
              <s-stack direction="block" gap="tight" className="srFlex1">
                <s-stack direction="inline" gap="base" alignment="center">
                  <s-text variant="subdued">
                    Usage: {shop.usage_count}/{plan.cap} messages this month
                  </s-text>
                  {shop.usage_count >= plan.cap * 0.8 && (
                    <s-badge tone={shop.usage_count >= plan.cap ? "critical" : "warning"}>
                      {shop.usage_count >= plan.cap ? "Limit Reached" : "Approaching Limit"}
                    </s-badge>
                  )}
                </s-stack>
                {shop.usage_count >= plan.cap * 0.8 && (
                  <s-box padding="tight" borderWidth="base" borderRadius="base" background={shop.usage_count >= plan.cap ? "critical" : "warning"}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong" tone={shop.usage_count >= plan.cap ? "critical" : "warning"}>
                        {shop.usage_count >= plan.cap 
                          ? "You've reached your monthly message limit!" 
                          : "You're approaching your monthly message limit"}
                      </s-text>
                      <s-button href="/app/billing/select" variant="primary">
                        Upgrade Plan
      </s-button>
                    </s-stack>
                  </s-box>
                )}
                {/* Progress bar */}
                <progress
                  className={`srProgress srProgress--${
                    shop.usage_count >= plan.cap
                      ? "critical"
                      : shop.usage_count >= plan.cap * 0.8
                        ? "warning"
                        : "ok"
                  }`}
                  value={shop.usage_count}
                  max={plan.cap}
                />
              </s-stack>
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
          
          {instagramFetcher.data?.success && instagramFetcher.data?.message?.includes("connected") && (
            <s-banner tone="success">
              <s-text variant="strong">Connected Successfully!</s-text>
              <s-text>{instagramFetcher.data.message}</s-text>
            </s-banner>
          )}
          
          {instagramFetcher.data?.error && (
            <s-banner tone="critical">
              <s-text variant="strong">Connection Error</s-text>
              <s-text>{instagramFetcher.data.error}</s-text>
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
              
              {/* Webhook Status */}
              {webhookStatus && (
                <s-box padding="base" borderWidth="base" borderRadius="base" background={webhookStatus.subscribed ? "success-subdued" : "warning-subdued"}>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="strong">
                      Webhook Status: {webhookStatus.subscribed ? "✅ Subscribed" : "⚠️ Not Subscribed"}
                    </s-text>
                    {webhookStatus.error && (
                      <s-text variant="subdued">
                        {webhookStatus.error} {webhookStatus.code && `(Code: ${webhookStatus.code})`}
                      </s-text>
                    )}
                    {!webhookStatus.subscribed && (
                      <s-stack direction="block" gap="base">
                        <s-text variant="subdued">
                          Webhooks won't work until your Meta app is approved. Until then, you can test manually.
                        </s-text>
                        {metaAuth?.ig_business_id && (
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                            <s-stack direction="block" gap="tight">
                              <s-text variant="strong">Test with Your Test Account:</s-text>
                              <s-text variant="subdued">
                                Your Instagram Business ID: <code>{metaAuth.ig_business_id}</code>
                              </s-text>
                              <s-text variant="subdued">
                                Use this ID in the test webhook payload below.
                              </s-text>
                              <pre className="srMonoPre">
{`curl -X POST https://dm-checkout-ai-production.up.railway.app/meta/test-webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "${metaAuth.ig_business_id}",
      "messaging": [{
        "sender": {"id": "test_user_123"},
        "recipient": {"id": "${metaAuth.ig_business_id}"},
        "message": {
          "mid": "test_message_${Date.now()}",
          "text": "I want to buy this product"
        },
        "timestamp": ${Math.floor(Date.now() / 1000)}
      }]
    }]
  }'`}
                              </pre>
                            </s-stack>
                          </s-box>
                        )}
                      </s-stack>
                    )}
                  </s-stack>
                </s-box>
              )}
          <s-button
                variant="secondary" 
                onClick={() => {
                  if (confirm("Are you sure you want to disconnect your Instagram account? You'll need to reconnect to use Instagram features.")) {
                    instagramFetcher.submit({ action: "disconnect" }, { method: "post" });
                  }
                }}
                disabled={instagramFetcher.state === "submitting"}
              >
                {instagramFetcher.state === "submitting" ? "Disconnecting..." : "Disconnect Instagram"}
          </s-button>
            </s-stack>
          ) : (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Connect your Instagram Business account to enable automation features.
              </s-paragraph>
              <s-banner tone="info">
                <s-text variant="strong">Two ways to connect</s-text>
                <s-text>
                  <strong>Instagram Login</strong> – No Facebook Page required. Sign in with your Instagram professional account.
                  <br />
                  <strong>Facebook Login</strong> – Uses a Facebook Page linked to your Instagram Business account.
                </s-text>
              </s-banner>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant="primary"
                  onClick={() => {
                    fetcher.submit({ connectType: "instagram-login" }, { method: "post" });
                  }}
                  disabled={fetcher.state === "submitting"}
                >
                  {fetcher.state === "submitting" ? "Connecting..." : "Connect with Instagram Login"}
                </s-button>
                <s-button
                  variant="secondary"
                  onClick={() => {
                    fetcher.submit({}, { method: "post" });
                  }}
                  disabled={fetcher.state === "submitting"}
                >
                  Connect with Facebook (Page)
                </s-button>
              </s-stack>
              <s-paragraph>
                <s-text variant="subdued">
                  Instagram Login: any Instagram professional (Business/Creator) account. Facebook: requires a Page linked to your IG Business account.
                </s-text>
              </s-paragraph>
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

          <automationFetcher.Form method="post">
            <input type="hidden" name="action" value="update-automation-settings" />
            <input type="hidden" name="dm_automation_enabled" value={dmAutomationEnabled ? "true" : "false"} />
            <input type="hidden" name="comment_automation_enabled" value={commentAutomationEnabled ? "true" : "false"} />
            <input type="hidden" name="followup_enabled" value={followupEnabled ? "true" : "false"} />
            <input type="hidden" name="brand_voice_tone" value={brandVoiceTone || "friendly"} />
            <input type="hidden" name="brand_voice_custom" value={brandVoiceCustom || ""} />
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
                    <label className="srCheckboxLabel">
                      <input
                        type="checkbox"
                        checked={dmAutomationEnabled}
                        onChange={(e) => setDmAutomationEnabled(e.target.checked)}
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
                    <label className="srCheckboxLabel">
                      <input
                        type="checkbox"
                        checked={commentAutomationEnabled}
                        onChange={(e) => setCommentAutomationEnabled(e.target.checked)}
                      />
                    </label>
                  </s-stack>
                </s-stack>
              </s-box>

              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong">Follow-Up Automation</s-text>
                      <s-text variant="subdued">
                        Automatically send follow-up messages 23-24 hours after the last message if no click was recorded
                      </s-text>
                    </s-stack>
                    <label className="srCheckboxLabel">
                      <input
                        type="checkbox"
                        checked={followupEnabled}
                        onChange={(e) => setFollowupEnabled(e.target.checked)}
                      />
                    </label>
                  </s-stack>
                </s-stack>
              </s-box>

              {/* Brand Voice (Growth/Pro) */}
              <PlanGate requiredPlan="GROWTH" feature="Brand Voice">
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="base">
                    <s-text variant="strong">Brand Voice</s-text>
                    <s-text variant="subdued">
                      Customize the tone and style of automated messages
                    </s-text>
                    
                    <s-stack direction="block" gap="tight">
                      <label>
                        <s-text variant="subdued">Tone</s-text>
                        <select
                          name="brand_voice_tone"
                          value={brandVoiceTone}
                          onChange={(e) => setBrandVoiceTone(e.target.value)}
                          className="srSelect"
                        >
                          <option value="friendly">Friendly</option>
                          <option value="expert">Expert</option>
                          <option value="casual">Casual</option>
                        </select>
                      </label>

                      <label>
                        <s-text variant="subdued">Custom Instruction (Optional)</s-text>
                        <textarea
                          name="brand_voice_custom"
                          value={brandVoiceCustom}
                          onChange={(e) => setBrandVoiceCustom(e.target.value)}
                          placeholder="Tell the AI how to sound (e.g., 'Always be enthusiastic and use emojis')"
                          rows={3}
                          className="srTextarea"
                        />
                      </label>
                    </s-stack>
                  </s-stack>
                </s-box>
              </PlanGate>

              <s-button type="submit" variant="primary">
                {automationFetcher.state === "submitting" ? "Saving..." : "Save Settings"}
              </s-button>
            </s-stack>
          </automationFetcher.Form>
          </s-section>
      </PlanGate>

      {/* Success/Error Messages */}
      {automationFetcher.data?.success && (
        <s-banner tone="success">
          <s-text>{automationFetcher.data.message}</s-text>
        </s-banner>
      )}

      {automationFetcher.data?.error && (
        <s-banner tone="critical">
          <s-text>{automationFetcher.data.error}</s-text>
        </s-banner>
      )}
      
      {instagramFetcher.data?.success && (
        <s-banner tone="success">
          <s-text>{instagramFetcher.data.message}</s-text>
        </s-banner>
      )}

      {instagramFetcher.data?.error && (
        <s-banner tone="critical">
          <s-text>{instagramFetcher.data.error}</s-text>
        </s-banner>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
