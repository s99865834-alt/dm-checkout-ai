import { useEffect, useState } from "react";
import { useFetcher, useSearchParams, useNavigate, useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuthWithRefresh, getInstagramAccountInfo, getInstagramMedia, deleteMetaAuth } from "../lib/meta.server";
import { getSettings, updateSettings, getBrandVoice, updateBrandVoice, getProductMappings, saveProductMapping, deleteProductMapping } from "../lib/db.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";

const META_APP_ID = process.env.META_APP_ID;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

export const loader = async ({ request }) => {
  const { shop, plan, admin } = await getShopWithPlan(request);

  let metaAuth = null;
  let instagramInfo = null;
  let settings = null;
  let brandVoice = null;
  let mediaData = null;
  let productMappings = [];
  let shopifyProducts = [];

  if (shop?.id) {
    const productsPromise = (async () => {
      try {
        const response = await admin.graphql(`
          query getProducts($first: Int!) {
            products(first: $first) {
              nodes {
                id
                title
                handle
                variants(first: 10) {
                  nodes {
                    id
                    title
                    price
                    selectedOptions { name value }
                  }
                }
              }
            }
          }
        `, { variables: { first: 50 } });
        const json = await response.json();
        return json.data?.products?.nodes || [];
      } catch (err) {
        console.error("[home] Error fetching Shopify products:", err.message);
        return [];
      }
    })();

    [metaAuth, settings, brandVoice, shopifyProducts] = await Promise.all([
      getMetaAuthWithRefresh(shop.id),
      getSettings(shop.id, plan?.name),
      getBrandVoice(shop.id),
      productsPromise,
    ]);

    if (metaAuth) {
      [instagramInfo, mediaData, productMappings] = await Promise.all([
        metaAuth.ig_business_id
          ? getInstagramAccountInfo(metaAuth.ig_business_id, shop.id)
          : Promise.resolve(null),
        (metaAuth.ig_business_id || metaAuth.auth_type === "instagram")
          ? getInstagramMedia(metaAuth.ig_business_id || "", shop.id, { limit: 25 }).catch(() => null)
          : Promise.resolve(null),
        getProductMappings(shop.id),
      ]);
    }
  }

  return { shop, plan, metaAuth, instagramInfo, settings, brandVoice, mediaData, productMappings, shopifyProducts };
};

export const action = async ({ request }) => {
  try {
    const { session, shop, plan, admin } = await getShopWithPlan(request);

    if (!session?.shop) {
      return { error: "Authentication failed. Please try again." };
    }

    const formData = await request.formData();
    const actionType = formData.get("action");

    // ── Disconnect Instagram ───────────────────────────────────────────────
    if (actionType === "disconnect") {
      if (!shop?.id) return { error: "Shop not found" };
      await deleteMetaAuth(shop.id);
      return { success: true, message: "Instagram account disconnected successfully" };
    }

    // ── Automation settings + brand voice ─────────────────────────────────
    if (actionType === "update-automation-settings") {
      if (!shop?.id) return { error: "Shop not found" };
      const dmAutomationEnabled = formData.get("dm_automation_enabled") === "true";
      const commentAutomationEnabled = formData.get("comment_automation_enabled") === "true";
      const followupEnabled = formData.get("followup_enabled") === "true";
      const brandVoiceTone = formData.get("brand_voice_tone") || null;
      const brandVoiceCustom = formData.get("brand_voice_custom") || "";
      try {
        const currentSettings = await getSettings(shop.id, plan?.name);
        await Promise.all([
          updateSettings(shop.id, {
            dm_automation_enabled: dmAutomationEnabled,
            comment_automation_enabled: commentAutomationEnabled,
            followup_enabled: followupEnabled,
            enabled_post_ids: currentSettings?.enabled_post_ids ?? null,
          }, plan?.name),
          updateBrandVoice(shop.id, {
            tone: brandVoiceTone || "friendly",
            custom_instruction: brandVoiceCustom?.trim() || null,
          }),
        ]);
        return { success: true, message: "Settings updated successfully" };
      } catch (err) {
        console.error("[home] Error updating settings:", err);
        return { error: err.message || "Failed to update settings" };
      }
    }

    // ── Toggle per-post automation ─────────────────────────────────────────
    if (actionType === "toggle-post-automation") {
      if (!shop?.id) return { error: "Shop not found" };
      const postId = formData.get("postId");
      const togglePost = formData.get("togglePost");
      if (!postId) return { error: "Missing post ID" };
      try {
        const currentSettings = await getSettings(shop.id, plan?.name);
        const current = currentSettings?.enabled_post_ids || [];
        let newIds;
        if (togglePost === "enable") {
          newIds = current.includes(postId) ? current : [...current, postId];
        } else {
          if (current.length === 0) {
            const allMediaIds = JSON.parse(formData.get("allMediaIds") || "[]");
            newIds = allMediaIds.filter((id) => id !== postId);
          } else {
            newIds = current.filter((id) => id !== postId);
          }
        }
        await updateSettings(shop.id, {
          dm_automation_enabled: currentSettings?.dm_automation_enabled ?? true,
          comment_automation_enabled: currentSettings?.comment_automation_enabled ?? true,
          followup_enabled: currentSettings?.followup_enabled ?? false,
          enabled_post_ids: newIds,
        }, plan?.name);
        return { success: true, actionType: "toggle-post-automation", newEnabledIds: newIds, message: `Post automation ${togglePost === "enable" ? "enabled" : "disabled"}` };
      } catch (err) {
        console.error("[home] Error toggling post automation:", err);
        return { error: err.message || "Failed to toggle post automation" };
      }
    }

    // ── Save product mapping ───────────────────────────────────────────────
    if (actionType === "save-mapping") {
      if (!shop?.id) return { error: "Shop not found" };
      const igMediaId = formData.get("igMediaId");
      let productId = formData.get("productId");
      const variantId = formData.get("variantId") || null;
      if (!igMediaId || !productId) return { error: "Missing required fields" };
      productId = String(productId).trim();
      // Ensure GID format for storage (Shopify Admin API expects gid://shopify/Product/123)
      if (!productId.startsWith("gid://")) {
        productId = `gid://shopify/Product/${productId.replace(/\D/g, "")}`;
      }
      try {
        const response = await admin.graphql(`
          query getProduct($id: ID!) {
            product(id: $id) {
              id
              handle
              variants(first: 1) { nodes { id } }
            }
          }
        `, { variables: { id: productId } });
        const json = await response.json();
        const product = json.data?.product;
        const variants = product?.variants?.nodes || [];
        if (variants.length === 0) return { error: "Product has no variants." };
        const finalVariantId = variantId || variants[0].id;
        const productHandle = product?.handle?.trim() || null;
        await saveProductMapping(shop.id, igMediaId, productId, finalVariantId, productHandle);
        return {
          success: true,
          actionType: "save-mapping",
          mapping: { ig_media_id: igMediaId, product_id: productId, variant_id: finalVariantId, product_handle: productHandle },
        };
      } catch (err) {
        console.error("[home] Error saving mapping:", err);
        return { error: err.message || "Failed to save mapping" };
      }
    }

    // ── Delete product mapping ─────────────────────────────────────────────
    if (actionType === "delete-mapping") {
      if (!shop?.id) return { error: "Shop not found" };
      const igMediaId = formData.get("igMediaId");
      if (!igMediaId) return { error: "Missing Instagram media ID" };
      try {
        await deleteProductMapping(shop.id, igMediaId);
        return { success: true, actionType: "delete-mapping", igMediaId };
      } catch (err) {
        console.error("[home] Error deleting mapping:", err);
        return { error: err.message || "Failed to delete mapping" };
      }
    }

    // ── Instagram OAuth connect ────────────────────────────────────────────
    const shopDomain = session.shop;
    const connectType = formData.get("connectType") || "instagram-login";
    const PRODUCTION_URL = "https://dm-checkout-ai-production.up.railway.app";
    const APP_URL = (process.env.SHOPIFY_APP_URL || process.env.APP_URL || PRODUCTION_URL).trim();
    const finalAppUrl = APP_URL.includes("railway.app") ? APP_URL : PRODUCTION_URL;

    if (!finalAppUrl?.startsWith("https://")) {
      return { error: "Server configuration error. Please contact support." };
    }

    if (connectType === "instagram-login") {
      const instagramAppId = process.env.META_INSTAGRAM_APP_ID;
      if (!instagramAppId) {
        return { error: "Instagram Login is not configured. Set META_INSTAGRAM_APP_ID in environment variables." };
      }
      const redirectUri = `${finalAppUrl}/meta/instagram-login/callback`;
      const scopes = ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"].join(",");
      const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${instagramAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(shopDomain)}#weblink`;
      return { oauthUrl: authUrl };
    }

    // Facebook Login fallback
    const redirectUri = `${finalAppUrl}/meta/instagram/callback`;
    const scopes = ["instagram_basic", "pages_show_list", "pages_read_engagement", "pages_manage_metadata", "instagram_manage_comments", "instagram_manage_messages"].join(",");
    const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&auth_type=rerequest&state=${encodeURIComponent(shopDomain)}`;
    return { oauthUrl: authUrl };
  } catch (error) {
    console.error("[home] Action error:", error);
    return { error: error.message || "An error occurred" };
  }
};

export default function Index() {
  const loaderData = useLoaderData();
  const { shop, plan, metaAuth, instagramInfo, settings, brandVoice, mediaData, productMappings, shopifyProducts } = loaderData || {};
  const { hasAccess } = usePlanAccess();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const isConnected = !!metaAuth;
  const disconnected = searchParams.get("disconnected") === "true";
  const error = searchParams.get("error");

  // Separate fetchers so actions don't conflict
  const connectFetcher = useFetcher();      // OAuth connect / disconnect
  const automationFetcher = useFetcher();   // Automation settings + brand voice
  const postFetcher = useFetcher();         // Per-post toggle, save/delete mapping

  // Automation / brand voice local state
  const [dmAutomationEnabled, setDmAutomationEnabled] = useState(settings?.dm_automation_enabled ?? true);
  const [commentAutomationEnabled, setCommentAutomationEnabled] = useState(settings?.comment_automation_enabled ?? true);
  const [followupEnabled, setFollowupEnabled] = useState(settings?.followup_enabled ?? false);
  const [brandVoiceTone, setBrandVoiceTone] = useState(brandVoice?.tone || "friendly");
  const [brandVoiceCustom, setBrandVoiceCustom] = useState(brandVoice?.custom_instruction || "");

  // Instagram feed local state
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");

  // Local mappings state: updated from actions so we never need to revalidate for mapping ops.
  // This preserves shopifyProducts from the initial load (revalidation can lose them).
  const [localMappings, setLocalMappings] = useState(productMappings || []);
  const [localProducts, setLocalProducts] = useState(shopifyProducts || []);

  // Sync from loader data when it changes (initial load or full revalidation)
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
    setLocalMappings(productMappings || []);
    if (shopifyProducts?.length) setLocalProducts(shopifyProducts);
  }, [settings, brandVoice, productMappings, shopifyProducts]);

  // After postFetcher completes: update mappings locally or revalidate for toggle-post
  useEffect(() => {
    if (postFetcher.state !== "idle" || !postFetcher.data?.success) return;
    const { actionType } = postFetcher.data;

    if (actionType === "save-mapping" && postFetcher.data.mapping) {
      setLocalMappings((prev) => {
        const filtered = prev.filter((m) => m.ig_media_id !== postFetcher.data.mapping.ig_media_id);
        return [...filtered, postFetcher.data.mapping];
      });
    } else if (actionType === "delete-mapping" && postFetcher.data.igMediaId) {
      setLocalMappings((prev) => prev.filter((m) => m.ig_media_id !== postFetcher.data.igMediaId));
    } else if (actionType === "toggle-post-automation" && postFetcher.data.newEnabledIds) {
      setLocalEnabledPostIds(postFetcher.data.newEnabledIds);
    }
  }, [postFetcher.state, postFetcher.data, revalidator]);

  // OAuth redirect — must break out of Shopify iframe
  useEffect(() => {
    if (connectFetcher.data?.oauthUrl) {
      try { window.top.location.href = connectFetcher.data.oauthUrl; }
      catch { window.location.href = connectFetcher.data.oauthUrl; }
    } else if (connectFetcher.data?.success && connectFetcher.data?.message?.includes("disconnected")) {
      navigate("/app?disconnected=true");
    }
  }, [connectFetcher.data, navigate]);

  // Feed helpers — normalize product ID for lookup (DB may store/return GID or numeric)
  const productIdMatch = (storedId, shopifyProductId) => {
    if (!storedId || !shopifyProductId) return false;
    const n = (id) => {
      if (id == null) return "";
      const s = String(id);
      const suffix = s.match(/\/(\d+)$/);
      return suffix ? suffix[1] : s;
    };
    return n(storedId) === n(shopifyProductId);
  };
  const mappingsMap = new Map((localMappings || []).map((m) => [m.ig_media_id, m]));
  const [localEnabledPostIds, setLocalEnabledPostIds] = useState(settings?.enabled_post_ids || []);

  useEffect(() => {
    setLocalEnabledPostIds(settings?.enabled_post_ids || []);
  }, [settings?.enabled_post_ids]);

  const isPostEnabled = (postId) => localEnabledPostIds.length === 0 || localEnabledPostIds.includes(postId);

  const handleTogglePost = (postId, currentlyEnabled) => {
    const fd = new FormData();
    fd.append("action", "toggle-post-automation");
    fd.append("postId", postId);
    fd.append("togglePost", currentlyEnabled ? "disable" : "enable");

    if (currentlyEnabled && localEnabledPostIds.length === 0 && mediaData?.data) {
      const allIds = mediaData.data.map((m) => m.id);
      fd.append("allMediaIds", JSON.stringify(allIds));
      setLocalEnabledPostIds(allIds.filter((id) => id !== postId));
    } else if (currentlyEnabled) {
      setLocalEnabledPostIds((prev) => prev.filter((id) => id !== postId));
    } else {
      setLocalEnabledPostIds((prev) => [...prev, postId]);
    }

    postFetcher.submit(fd, { method: "post" });
  };

  const handleSaveMapping = (mediaId) => {
    if (!selectedProduct) { alert("Please select a product"); return; }
    const fd = new FormData();
    fd.append("action", "save-mapping");
    fd.append("igMediaId", mediaId);
    fd.append("productId", selectedProduct);
    if (selectedVariant) fd.append("variantId", selectedVariant);
    postFetcher.submit(fd, { method: "post" });
    setSelectedMedia(null);
    setSelectedProduct("");
    setSelectedVariant("");
  };

  const handleDeleteMapping = (mediaId) => {
    if (!confirm("Remove this product mapping?")) return;
    const fd = new FormData();
    fd.append("action", "delete-mapping");
    fd.append("igMediaId", mediaId);
    postFetcher.submit(fd, { method: "post" });
  };

  const selectedProductData = (localProducts || []).find((p) => p.id === selectedProduct);
  const selectedProductVariants = selectedProductData?.variants?.nodes || [];

  return (
    <s-page heading="DM Checkout AI">

      {/* ── Banners ────────────────────────────────────────────────────── */}
      {error && (
        <s-banner tone="critical">
          <s-text variant="strong">Connection error</s-text>
          <s-text>{error}</s-text>
        </s-banner>
      )}
      {disconnected && !error && !isConnected && (
        <s-banner tone="info"><s-text>Instagram account disconnected.</s-text></s-banner>
      )}
      {connectFetcher.data?.error && (
        <s-banner tone="critical"><s-text>{connectFetcher.data.error}</s-text></s-banner>
      )}
      {automationFetcher.data?.success && (
        <s-banner tone="success"><s-text>{automationFetcher.data.message}</s-text></s-banner>
      )}
      {automationFetcher.data?.error && (
        <s-banner tone="critical"><s-text>{automationFetcher.data.error}</s-text></s-banner>
      )}
      {postFetcher.data?.success && (
        <s-banner tone="success"><s-text>{postFetcher.data.message}</s-text></s-banner>
      )}
      {postFetcher.data?.error && (
        <s-banner tone="critical"><s-text>{postFetcher.data.error}</s-text></s-banner>
      )}
      {shop?.beta_trial_expires_at && new Date(shop.beta_trial_expires_at) > new Date() && (
        <s-banner tone="success">
          <s-text variant="strong">Beta Trial Active</s-text>
          <s-text>
            {" "}Full PRO access until{" "}
            {new Date(shop.beta_trial_expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            {" "}({Math.ceil((new Date(shop.beta_trial_expires_at) - new Date()) / (1000 * 60 * 60 * 24))} days remaining)
          </s-text>
        </s-banner>
      )}

      {/* ── Plan & Instagram ───────────────────────────────────────────── */}
      <s-section heading="Plan & Instagram">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" className="srCardCompact">
          <div className="srPlanIGRow">

            {/* Left: plan badge inline with usage count, progress bar below */}
            {shop && plan && (
              <div className="srPlanSide">
                <div className="srPlanBadgeRow">
                  <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
                    {plan.name}
                  </s-badge>
                  {shop.beta_trial_expires_at && new Date(shop.beta_trial_expires_at) > new Date() && (
                    <s-badge tone="warning">BETA</s-badge>
                  )}
                  {shop.usage_count !== undefined && (
                    <span className="srCardDesc">
                      {shop.usage_count}/{plan.cap} messages this month
                    </span>
                  )}
                  {shop.usage_count >= plan.cap * 0.8 && (
                    <s-badge tone={shop.usage_count >= plan.cap ? "critical" : "warning"}>
                      {shop.usage_count >= plan.cap ? "Limit Reached" : "Approaching Limit"}
                    </s-badge>
                  )}
                </div>
                {shop.usage_count !== undefined && (
                  <progress
                    className={`srProgress srProgress--${
                      shop.usage_count >= plan.cap ? "critical"
                        : shop.usage_count >= plan.cap * 0.8 ? "warning" : "ok"
                    } srProgressSlim`}
                    value={shop.usage_count}
                    max={plan.cap}
                  />
                )}
                {shop.usage_count >= plan.cap && (
                  <s-button href="/app/billing/select" variant="primary" size="slim" className="srBtnCompact srUpgradeBtn">
                    Upgrade plan
                  </s-button>
                )}
              </div>
            )}

            <div className="srPlanIGDivider" />

            {/* Right: Instagram status + action on one line, details below */}
            <div className="srIGSide">
              {isConnected ? (
                <div className="srIGConnectedRow">
                  <div className="srIGConnectedInfo">
                    <span className="srCardTitle">
                      Connected{instagramInfo?.username ? ` · @${instagramInfo.username}` : ""}
                    </span>
                    {(instagramInfo?.id || metaAuth?.ig_business_id) && (
                      <span className="srCardDesc">
                        ID: {instagramInfo?.id || metaAuth.ig_business_id}
                      </span>
                    )}
                  </div>
                  <s-button
                    variant="secondary" size="slim" className="srBtnCompact"
                    onClick={() => {
                      if (confirm("Disconnect your Instagram account? You can reconnect anytime.")) {
                        connectFetcher.submit({ action: "disconnect" }, { method: "post" });
                      }
                    }}
                    disabled={connectFetcher.state === "submitting"}
                  >
                    {connectFetcher.state === "submitting" ? "Disconnecting…" : "Disconnect"}
                  </s-button>
                </div>
              ) : (
                <div className="srIGConnectedRow">
                  <span className="srCardDesc">
                    Connect your Instagram Business account to enable automation.
                  </span>
                  <s-button
                    variant="primary" size="slim" className="srBtnCompact"
                    onClick={() => connectFetcher.submit({ connectType: "instagram-login" }, { method: "post" })}
                    disabled={connectFetcher.state === "submitting"}
                  >
                    {connectFetcher.state === "submitting" ? "Connecting…" : "Connect Instagram"}
                  </s-button>
                </div>
              )}
            </div>

          </div>
        </s-box>
      </s-section>

      {/* ── Automation ────────────────────────────────────────────────── */}
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
              {/* Left: toggles */}
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <div className="srToggleStack">
                  <div className="srToggleRow">
                    <div className="srToggleRowInner">
                      <div className="srToggleRowText">
                        <span className="srCardTitle">DM automation</span>
                        <span className="srCardDesc">Process and reply to Instagram DMs</span>
                      </div>
                      <label className="srToggle">
                        <input type="checkbox" checked={dmAutomationEnabled} onChange={(e) => setDmAutomationEnabled(e.target.checked)} />
                        <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                      </label>
                    </div>
                  </div>
                  <div className="srToggleRow">
                    <div className="srToggleRowInner">
                      <div className="srToggleRowText">
                        <span className="srCardTitle">Comment automation</span>
                        <span className="srCardDesc">Process and reply to comments on posts</span>
                      </div>
                      <label className="srToggle">
                        <input type="checkbox" checked={commentAutomationEnabled} onChange={(e) => setCommentAutomationEnabled(e.target.checked)} />
                        <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                      </label>
                    </div>
                  </div>
                  <div className="srToggleRow srToggleRowLast">
                    <div className="srToggleRowInner">
                      <div className="srToggleRowText">
                        <span className="srCardTitle">Follow-up messages</span>
                        <span className="srCardDesc">Send a reminder 23–24 hours after last message if no link click</span>
                      </div>
                      <label className="srToggle">
                        <input type="checkbox" checked={followupEnabled} onChange={(e) => setFollowupEnabled(e.target.checked)} />
                        <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                      </label>
                    </div>
                  </div>
                </div>
              </s-box>

              {/* Right: brand voice */}
              <PlanGate requiredPlan="GROWTH" feature="Brand Voice">
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <div className="srToggleStack">
                    <div className="srToggleRow">
                      <div className="srToggleRowText">
                        <span className="srCardTitle">Tone</span>
                        <span className="srCardDesc">Overall style of automated replies</span>
                        <select value={brandVoiceTone} onChange={(e) => setBrandVoiceTone(e.target.value)} className="srSelect srInputRow">
                          <option value="friendly">Friendly</option>
                          <option value="expert">Expert</option>
                          <option value="casual">Casual</option>
                        </select>
                      </div>
                    </div>
                    <div className="srToggleRow srToggleRowLast">
                      <div className="srToggleRowText">
                        <span className="srCardTitle">Custom Voice</span>
                        <span className="srCardDesc">Optional override for reply style</span>
                        <input
                          type="text"
                          value={brandVoiceCustom}
                          onChange={(e) => setBrandVoiceCustom(e.target.value)}
                          placeholder="e.g. Always be enthusiastic and use emojis"
                          className="srInput srInputRow"
                        />
                      </div>
                    </div>
                  </div>
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

      {/* ── Your Instagram Posts ───────────────────────────────────────── */}
      {isConnected && (
        <s-section heading="Your Instagram Posts">
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="srCardDesc">
              Map posts to Shopify products so the AI knows which product to link when customers DM or comment. Use the checkboxes to enable or disable automation per post.
            </span>

            {metaAuth?.auth_type === "instagram" && (
              <s-callout variant="info" title="Comment replies require Facebook Login">
                <s-paragraph>
                  Instagram Login supports DMs but cannot send private comment replies. Connect via Facebook on this page to enable comment automation.
                </s-paragraph>
              </s-callout>
            )}

            {!mediaData ? (
              <span className="srCardDesc">Fetching your Instagram posts…</span>
            ) : mediaData.data?.length > 0 ? (
              <div className="srMediaGrid">
                {mediaData.data.map((media) => {
                  const mapping = mappingsMap.get(media.id);
                  const mappedProduct = mapping
                    ? (localProducts || []).find((p) => productIdMatch(mapping.product_id, p.id))
                    : null;
                  const variantIdMatch = (stored, nodes) => {
                    if (!stored || !nodes?.length) return null;
                    const n = (id) => (id == null ? "" : (String(id).match(/\/(\d+)$/)?.[1] ?? String(id)));
                    return nodes.find((v) => n(v.id) === n(stored)) ?? null;
                  };
                  const mappedVariant = mapping && mappedProduct && mapping.variant_id
                    ? variantIdMatch(mapping.variant_id, mappedProduct.variants?.nodes)
                    : null;
                  const automationEnabled = isPostEnabled(media.id);

                  return (
                    <s-box key={media.id} padding="base" borderWidth="base" borderRadius="base">
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {media.media_url && (
                          <img src={media.media_url} alt={media.caption || "Instagram post"} className="srMediaImage" />
                        )}
                        {media.caption && (
                          <span className="srGridTextSubdued srClamp2">{media.caption}</span>
                        )}
                        <div className="srGridMeta">
                          {media.like_count !== undefined && <span>❤️ {media.like_count}</span>}
                          {media.comments_count !== undefined && <span>💬 {media.comments_count}</span>}
                        </div>

                        {/* Per-post automation toggle */}
                        <s-box padding="tight" borderWidth="base" borderRadius="base"
                          background={automationEnabled ? "success-subdued" : "subdued"}>
                          <div className="srGridToggleRow srGridStatusBox">
                            <div className="srGridToggleInfo">
                              <span className="srGridTextStrong">
                                {automationEnabled ? "Automation Enabled" : "Automation Disabled"}
                              </span>
                              <span className="srGridTextSubdued">
                                {automationEnabled
                                  ? "AI will respond to comments/DMs on this post"
                                  : "AI will NOT respond to comments/DMs on this post"}
                              </span>
                            </div>
                            <label className="srCheckboxLabel">
                              <input
                                type="checkbox"
                                checked={automationEnabled}
                                onChange={() => handleTogglePost(media.id, automationEnabled)}
                                disabled={postFetcher.state !== "idle"}
                              />
                            </label>
                          </div>
                        </s-box>

                        {/* Product mapping */}
                        {mapping ? (
                          <s-box padding="tight" borderWidth="base" borderRadius="base" background="success-subdued">
                            <div className="srGridStatusBox" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <span className="srGridTextSuccess">Mapped to Product</span>
                              <span className="srGridTextSubdued">
                                {mappedProduct?.title || (mapping.product_handle ? `Product: ${mapping.product_handle}` : "Product")}
                                {mappedVariant && ` (${mappedVariant.title})`}
                              </span>
                              <s-button
                                variant="secondary" size="small"
                                onClick={() => handleDeleteMapping(media.id)}
                                disabled={postFetcher.state !== "idle"}
                              >
                                Remove Mapping
                              </s-button>
                            </div>
                          </s-box>
                        ) : (
                          <s-box padding="tight" borderWidth="base" borderRadius="base" background="subdued">
                            <div className="srGridStatusBox" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <span className="srGridTextSubdued">Not mapped</span>
                              <s-button
                                variant="primary" size="small"
                                onClick={() => setSelectedMedia(media.id)}
                                disabled={postFetcher.state !== "idle"}
                              >
                                Map to Product
                              </s-button>
                            </div>
                          </s-box>
                        )}

                        {/* Product picker */}
                        {selectedMedia === media.id && (
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                              <label htmlFor={`product-${media.id}`}>
                                <span className="srGridTextStrong">Select Product:</span>
                              </label>
                              {(localProducts || []).length === 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <span className="srGridTextSubdued">
                                    No products to show. Your store may have no products, or the list could not be loaded.
                                  </span>
                                  <s-button
                                    variant="secondary"
                                    size="small"
                                    onClick={() => revalidator.revalidate()}
                                    disabled={revalidator.state === "loading"}
                                  >
                                    {revalidator.state === "loading" ? "Loading…" : "Retry"}
                                  </s-button>
                                </div>
                              ) : (
                                <>
                                  <select
                                    id={`product-${media.id}`}
                                    value={selectedProduct}
                                    onChange={(e) => { setSelectedProduct(e.target.value); setSelectedVariant(""); }}
                                    className="srSelect"
                                  >
                                    <option value="">-- Select Product --</option>
                                    {(localProducts || []).map((p) => (
                                      <option key={p.id} value={p.id}>{p.title}</option>
                                    ))}
                                  </select>

                                  {selectedProduct && selectedProductVariants.length > 1 && (
                                    <>
                                      <label htmlFor={`variant-${media.id}`}>
                                        <span className="srGridTextStrong">Select Variant (Optional):</span>
                                      </label>
                                      <select
                                        id={`variant-${media.id}`}
                                        value={selectedVariant}
                                        onChange={(e) => setSelectedVariant(e.target.value)}
                                        className="srSelect"
                                      >
                                        <option value="">-- Default Variant --</option>
                                        {selectedProductVariants.map((v) => (
                                          <option key={v.id} value={v.id}>{v.title} - ${v.price}</option>
                                        ))}
                                      </select>
                                    </>
                                  )}

                                  <div style={{ display: "flex", gap: "8px" }}>
                                    <s-button
                                      variant="primary" size="small"
                                      onClick={() => handleSaveMapping(media.id)}
                                      disabled={!selectedProduct || postFetcher.state !== "idle"}
                                    >
                                      Save Mapping
                                    </s-button>
                                    <s-button
                                      variant="secondary" size="small"
                                      onClick={() => { setSelectedMedia(null); setSelectedProduct(""); setSelectedVariant(""); }}
                                    >
                                      Cancel
                                    </s-button>
                                  </div>
                                </>
                              )}
                            </div>
                          </s-box>
                        )}
                      </div>
                    </s-box>
                  );
                })}
              </div>
            ) : (
              <span className="srGridTextSubdued">No Instagram posts found.</span>
            )}
          </div>
        </s-section>
      )}

    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
