import { useEffect, useState } from "react";
import { useFetcher, useOutletContext, useSearchParams, useNavigate, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth, getInstagramAccountInfo, deleteMetaAuth } from "../lib/meta.server";
import { getSettings, updateSettings, getBrandVoice, updateBrandVoice } from "../lib/db.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";

const META_APP_ID = process.env.META_APP_ID;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);

  let metaAuth = null;
  let instagramInfo = null;
  let settings = null;
  let brandVoice = null;

  if (shop?.id) {
    // Fetch independent DB reads in parallel
    [metaAuth, settings, brandVoice] = await Promise.all([
      getMetaAuth(shop.id),
      getSettings(shop.id),
      getBrandVoice(shop.id),
    ]);

    // Instagram info depends on metaAuth, so fetch after
    if (metaAuth?.ig_business_id) {
      instagramInfo = await getInstagramAccountInfo(metaAuth.ig_business_id, shop.id);
    }
  }

  return { shop, plan, metaAuth, instagramInfo, settings, brandVoice };
};

export const action = async ({ request }) => {
  try {
    const { session, shop, plan } = await getShopWithPlan(request);

    if (!session || !session.shop) {
      return { error: "Authentication failed. Please try again." };
    }

    const formData = await request.formData();
    const actionType = formData.get("action");
    
    console.log("[home] Action called with actionType:", actionType);
    
    // Handle disconnect action
    if (actionType === "disconnect") {
      if (!shop?.id) {
        return { error: "Shop not found" };
      }
      
      await deleteMetaAuth(shop.id);
      return { success: true, message: "Instagram account disconnected successfully" };
    }
    
    // Handle automation settings update
    if (actionType === "update-automation-settings") {
      console.log("[home] Processing update-automation-settings action");
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
        }, plan?.name);
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
    
    // Handle connect action (OAuth flow) – Instagram Login (Facebook Login kept server-side)
    const shopDomain = session.shop;
    const connectType = formData.get("connectType") || "instagram-login";

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
          error: "Instagram Login is not configured. Set META_INSTAGRAM_APP_ID (and META_INSTAGRAM_APP_SECRET) from Meta App Dashboard → Instagram → API setup with Instagram login → Set up Instagram business login → Business login settings → Instagram App ID. The main app ID cannot be used for Instagram Login.",
        };
      }
      const redirectUri = `${finalAppUrl}/meta/instagram-login/callback`;
      const scopes = [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
      ].join(",");
      // Use api.instagram.com per Meta docs; #weblink keeps flow in browser (avoids native app takeover on mobile)
      const authUrl = `https://api.instagram.com/oauth/authorize?` +
        `client_id=${instagramAppId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${encodeURIComponent(shopDomain)}#weblink`;
      return { oauthUrl: authUrl };
    }

    // Facebook Login (server-side only) – requires Facebook Page linked to IG Business
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
  const { shop, plan, metaAuth, instagramInfo, settings, brandVoice } = loaderData || {};
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
      {error && (
        <s-banner tone="critical">
          <s-text variant="strong">Connection error</s-text>
          <s-text>{error}</s-text>
        </s-banner>
      )}
      {instagramFetcher.data?.success && instagramFetcher.data?.message?.includes("connected") && (
        <s-banner tone="success">
          <s-text>{instagramFetcher.data.message}</s-text>
        </s-banner>
      )}
      {instagramFetcher.data?.error && (
        <s-banner tone="critical">
          <s-text>{instagramFetcher.data.error}</s-text>
        </s-banner>
      )}
      {disconnected && !error && !isConnected && (
        <s-banner tone="info">
          <s-text>Instagram account disconnected.</s-text>
        </s-banner>
      )}
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

      {/* Plan & Instagram — full width, two-column interior */}
      <s-section heading="Plan & Instagram">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" className="srCardCompact">
          <div className="srPlanIGRow">
            {/* Left: plan badge + usage + progress */}
            {shop && plan && (
              <div className="srPlanSide">
                <s-stack direction="block" gap="tight">
                  <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
                    {plan.name}
                  </s-badge>
                  {shop.usage_count !== undefined && (
                    <s-stack direction="block" gap="tight" className="srUsageBlock">
                      <s-text variant="subdued" className="srCardDesc">
                        {shop.usage_count}/{plan.cap} messages this month
                      </s-text>
                      {shop.usage_count >= plan.cap * 0.8 && (
                        <s-badge tone={shop.usage_count >= plan.cap ? "critical" : "warning"}>
                          {shop.usage_count >= plan.cap ? "Limit Reached" : "Approaching Limit"}
                        </s-badge>
                      )}
                      {shop.usage_count >= plan.cap * 0.8 && (
                        <s-box padding="tight" borderWidth="base" borderRadius="base" background={shop.usage_count >= plan.cap ? "critical" : "warning"}>
                          <s-stack direction="block" gap="tight">
                            <s-text variant="strong" tone={shop.usage_count >= plan.cap ? "critical" : "warning"}>
                              {shop.usage_count >= plan.cap
                                ? "You've reached your monthly message limit!"
                                : "You're approaching your monthly message limit"}
                            </s-text>
                            <s-button href="/app/billing/select" variant="primary" size="slim" className="srBtnCompact">
                              Upgrade
                            </s-button>
                          </s-stack>
                        </s-box>
                      )}
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
              </div>
            )}

            {/* Vertical divider */}
            <div className="srPlanIGDivider" />

            {/* Right: Instagram connection */}
            <div className="srIGSide">
              {isConnected ? (
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong" className="srCardTitle">Connected</s-text>
                      {instagramInfo?.username && (
                        <s-text variant="subdued" className="srCardDesc">@{instagramInfo.username}</s-text>
                      )}
                    </s-stack>
                    <s-button
                      variant="secondary"
                      size="slim"
                      className="srBtnCompact"
                      onClick={() => {
                        if (confirm("Disconnect your Instagram account? You can reconnect anytime.")) {
                          instagramFetcher.submit({ action: "disconnect" }, { method: "post" });
                        }
                      }}
                      disabled={instagramFetcher.state === "submitting"}
                    >
                      {instagramFetcher.state === "submitting" ? "Disconnecting…" : "Disconnect"}
                    </s-button>
                  </s-stack>
                  {(instagramInfo?.id || metaAuth?.ig_business_id) && (
                    <s-text variant="subdued" className="srCardDesc">
                      Account ID: {instagramInfo?.id || metaAuth.ig_business_id}
                      {metaAuth.token_expires_at && ` · Token expires ${new Date(metaAuth.token_expires_at).toLocaleDateString()}`}
                    </s-text>
                  )}
                </s-stack>
              ) : (
                <s-stack direction="block" gap="base">
                  <s-text variant="strong" className="srCardTitle">Not connected</s-text>
                  <s-text variant="subdued" className="srCardDesc">
                    Connect your Instagram Business or Creator account to enable automation.
                  </s-text>
                  <s-button
                    variant="primary"
                    className="srBtnCompact"
                    onClick={() => fetcher.submit({ connectType: "instagram-login" }, { method: "post" })}
                    disabled={fetcher.state === "submitting"}
                  >
                    {fetcher.state === "submitting" ? "Connecting…" : "Connect Instagram"}
                  </s-button>
                </s-stack>
              )}
            </div>
          </div>
        </s-box>
      </s-section>

      {/* Automation — two equal columns, both styled like toggle rows */}
      <PlanGate requiredPlan="PRO" feature="Automation Controls">
        <s-section heading="Automation">
          <automationFetcher.Form method="post">
            <input type="hidden" name="action" value="update-automation-settings" />
            <input type="hidden" name="dm_automation_enabled" value={dmAutomationEnabled ? "true" : "false"} />
            <input type="hidden" name="comment_automation_enabled" value={commentAutomationEnabled ? "true" : "false"} />
            <input type="hidden" name="followup_enabled" value={followupEnabled ? "true" : "false"} />
            <input type="hidden" name="brand_voice_tone" value={brandVoiceTone || "friendly"} />
            <input type="hidden" name="brand_voice_custom" value={brandVoiceCustom || ""} />

            <div className="srAutoTwoCol">
              {/* Left: automation toggles */}
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="none" className="srToggleStack">
                  <div className="srToggleRow">
                    <s-stack direction="inline" gap="base" alignment="space-between">
                      <s-stack direction="block" gap="tight">
                        <s-text variant="strong" className="srCardTitle">DM automation</s-text>
                        <s-text variant="subdued" className="srCardDesc">Process and reply to Instagram DMs</s-text>
                      </s-stack>
                      <label className="srToggle">
                        <input type="checkbox" checked={dmAutomationEnabled} onChange={(e) => setDmAutomationEnabled(e.target.checked)} />
                        <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                      </label>
                    </s-stack>
                  </div>
                  <div className="srToggleRow">
                    <s-stack direction="inline" gap="base" alignment="space-between">
                      <s-stack direction="block" gap="tight">
                        <s-text variant="strong" className="srCardTitle">Comment automation</s-text>
                        <s-text variant="subdued" className="srCardDesc">Process and reply to comments on posts</s-text>
                      </s-stack>
                      <label className="srToggle">
                        <input type="checkbox" checked={commentAutomationEnabled} onChange={(e) => setCommentAutomationEnabled(e.target.checked)} />
                        <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                      </label>
                    </s-stack>
                  </div>
                  <div className="srToggleRow srToggleRowLast">
                    <s-stack direction="inline" gap="base" alignment="space-between">
                      <s-stack direction="block" gap="tight">
                        <s-text variant="strong" className="srCardTitle">Follow-up messages</s-text>
                        <s-text variant="subdued" className="srCardDesc">Send a reminder 23–24 hours after last message if no link click</s-text>
                      </s-stack>
                      <label className="srToggle">
                        <input type="checkbox" checked={followupEnabled} onChange={(e) => setFollowupEnabled(e.target.checked)} />
                        <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                      </label>
                    </s-stack>
                  </div>
                </s-stack>
              </s-box>

              {/* Right: brand voice — same row/divider pattern as left */}
              <PlanGate requiredPlan="GROWTH" feature="Brand Voice">
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="none" className="srToggleStack">
                    <div className="srToggleRow">
                      <s-stack direction="inline" gap="base" alignment="space-between">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="strong" className="srCardTitle">Tone</s-text>
                          <s-text variant="subdued" className="srCardDesc">Overall style of automated replies</s-text>
                        </s-stack>
                        <select value={brandVoiceTone} onChange={(e) => setBrandVoiceTone(e.target.value)} className="srSelect srSelectInline">
                          <option value="friendly">Friendly</option>
                          <option value="expert">Expert</option>
                          <option value="casual">Casual</option>
                        </select>
                      </s-stack>
                    </div>
                    <div className="srToggleRow srToggleRowLast">
                      <s-stack direction="block" gap="tight">
                        <s-text variant="strong" className="srCardTitle">Custom instruction</s-text>
                        <s-text variant="subdued" className="srCardDesc">Optional override for reply style</s-text>
                        <input
                          type="text"
                          value={brandVoiceCustom}
                          onChange={(e) => setBrandVoiceCustom(e.target.value)}
                          placeholder="e.g. Always be enthusiastic and use emojis"
                          className="srInput srInputRow"
                        />
                      </s-stack>
                    </div>
                  </s-stack>
                </s-box>
              </PlanGate>
            </div>

            <div className="srSaveBtnWrap">
              <s-button type="submit" variant="primary" className="srBtnCompact">
                {automationFetcher.state === "submitting" ? "Saving…" : "Save settings"}
              </s-button>
            </div>
          </automationFetcher.Form>
        </s-section>
      </PlanGate>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
