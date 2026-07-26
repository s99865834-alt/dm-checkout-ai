import { Suspense, useEffect, useState, useRef } from "react";
import { Await, useFetcher, useSearchParams, useNavigate, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuthWithRefresh, getInstagramAccountInfo, getInstagramMedia, deleteMetaAuth } from "../lib/meta.server";
import { getSettings, updateSettings, getBrandVoice, updateBrandVoice, getProductMappings, saveProductMapping, deleteProductMapping, getMissedCommentCount, getAttributionCount, getSentLinkCount, recordReviewPrompt } from "../lib/db.server";
import { getCurrentSubscription, getTrialStatus } from "../lib/billing.server";
import { cached, invalidateCached } from "../lib/loader-cache.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";
import { PostsSection, PostsSectionSkeleton } from "../components/home/PostsSection";

const META_APP_ID = process.env.META_APP_ID;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

// Review-prompt pacing. We re-ask only after a cooldown, and never more than
// a hard cap of times, so a merchant who keeps dismissing isn't pestered.
const REVIEW_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days between asks
const REVIEW_MAX_ASKS = 3; // worst case: day 0, ~30, ~60, then stop forever

// Server-side cache TTLs for slow, slow-changing loader data. Product catalog
// and Instagram media tolerate a few minutes of staleness; trial status only
// changes on plan events (which invalidate it explicitly in the billing routes).
const PRODUCTS_TTL_MS = 5 * 60 * 1000;
const IG_TTL_MS = 5 * 60 * 1000;
const TRIAL_TTL_MS = 15 * 60 * 1000;

// The loader is split for Core Web Vitals (LCP < 2.5s):
//   - Awaited: everything the shell + banners need — cheap DB reads plus the
//     (cached) trial status. Banners MUST come from awaited data so they're in
//     the first paint and never pop in later (CLS).
//   - Streamed (`deferred`): the slow external calls — Shopify product catalog
//     and Instagram account/media. The page renders immediately with a
//     skeleton grid and these stream in when ready.
export const loader = async ({ request }) => {
  const { shop, plan, admin } = await getShopWithPlan(request);

  let metaAuth = null;
  let settings = null;
  let brandVoice = null;
  let productMappings = [];
  let missedComments = 0;
  let trialStatus = null;
  let reviewEligible = false;

  if (shop?.id) {
    let attributionCount = 0;
    let sentLinkCount = 0;
    [metaAuth, settings, brandVoice, productMappings, missedComments, trialStatus, attributionCount, sentLinkCount] =
      await Promise.all([
        getMetaAuthWithRefresh(shop.id),
        getSettings(shop.id),
        getBrandVoice(shop.id),
        getProductMappings(shop.id).catch(() => []),
        plan?.name === "FREE" ? getMissedCommentCount(shop.id) : Promise.resolve(0),
        // Free-trial countdown for the banner. Failure-safe and cached: a
        // billing API hiccup should never block the dashboard, and the Shopify
        // call only runs once per TTL instead of on every page load.
        plan?.name !== "FREE"
          ? cached(`trial:${shop.id}`, TRIAL_TTL_MS, async () => {
              try {
                const subscription = await getCurrentSubscription(admin);
                return getTrialStatus(subscription);
              } catch (err) {
                console.error("[home] Error fetching trial status:", err.message);
                return null;
              }
            })
          : Promise.resolve(null),
        // Review-prompt eligibility: first attributed order OR 20+ sent replies.
        getAttributionCount(shop.id),
        getSentLinkCount(shop.id),
      ]);
    reviewEligible = attributionCount >= 1 || sentLinkCount >= 20;
  }

  // Slow externals, streamed to the client as one promise (not awaited here).
  // Each leg is failure-safe and cached so repeat loads inside the TTL are
  // instant. Bundled into a single promise so the posts section renders once.
  const shopId = shop?.id;
  const igBusinessId = metaAuth?.ig_business_id || null;
  const hasIg = !!metaAuth && (!!igBusinessId || metaAuth.auth_type === "instagram");
  const deferred = (async () => {
    if (!shopId) return { shopifyProducts: [], instagramInfo: null, mediaData: null };
    const [shopifyProducts, instagramInfo, mediaData] = await Promise.all([
      cached(`products:${shopId}`, PRODUCTS_TTL_MS, async () => {
        try {
          const response = await admin.graphql(`
            query getProducts($first: Int!) {
              products(first: $first) {
                nodes {
                  id
                  title
                  handle
                  variants(first: 100) {
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
      }),
      igBusinessId
        ? cached(`iginfo:${shopId}`, IG_TTL_MS, () =>
            getInstagramAccountInfo(igBusinessId, shopId),
          ).catch(() => null)
        : Promise.resolve(null),
      hasIg
        ? cached(`igmedia:${shopId}`, IG_TTL_MS, () =>
            getInstagramMedia(igBusinessId || "", shopId, { limit: 25 }),
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
    return { shopifyProducts, instagramInfo, mediaData };
  })();

  return { shop, plan, metaAuth, settings, brandVoice, productMappings, missedComments, trialStatus, reviewEligible, deferred };
};

export const action = async ({ request }) => {
  try {
    const { session, shop, plan, admin } = await getShopWithPlan(request);

    if (!session?.shop) {
      return { error: "Authentication failed. Please try again." };
    }

    const formData = await request.formData();
    const actionType = formData.get("action");

    // ── Record review-prompt attempt (fire-and-forget from the client) ────
    if (actionType === "record-review-prompt") {
      if (!shop?.id) return { error: "Shop not found" };
      await recordReviewPrompt(shop.id, formData.get("result"));
      return { success: true };
    }

    // ── Disconnect Instagram ───────────────────────────────────────────────
    if (actionType === "disconnect") {
      if (!shop?.id) return { error: "Shop not found" };
      await deleteMetaAuth(shop.id);
      // Cached IG data belongs to the disconnected account; drop it so a
      // reconnect doesn't briefly show the old account's posts.
      invalidateCached(`iginfo:${shop.id}`);
      invalidateCached(`igmedia:${shop.id}`);
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
      const brandVoiceReplyLang = formData.get("brand_voice_reply_language") || "auto";
      try {
        const currentSettings = await getSettings(shop.id);
        await Promise.all([
          updateSettings(shop.id, {
            dm_automation_enabled: dmAutomationEnabled,
            comment_automation_enabled: commentAutomationEnabled,
            followup_enabled: followupEnabled,
            disabled_post_ids: currentSettings?.disabled_post_ids ?? [],
          }),
          updateBrandVoice(shop.id, {
            tone: brandVoiceTone || "friendly",
            custom_instruction: brandVoiceCustom?.trim() || null,
            reply_language: brandVoiceReplyLang || "auto",
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
        const currentSettings = await getSettings(shop.id);
        // Deny-list: disabling a post adds it, enabling removes it. Posts not
        // in the list (including ones published later) are always automated.
        const current = Array.isArray(currentSettings?.disabled_post_ids)
          ? currentSettings.disabled_post_ids
          : [];
        const newIds = togglePost === "enable"
          ? current.filter((id) => id !== postId)
          : current.includes(postId) ? current : [...current, postId];
        await updateSettings(shop.id, {
          dm_automation_enabled: currentSettings?.dm_automation_enabled ?? true,
          comment_automation_enabled: currentSettings?.comment_automation_enabled ?? true,
          followup_enabled: currentSettings?.followup_enabled ?? true,
          disabled_post_ids: newIds,
        });
        return { success: true, actionType: "toggle-post-automation", newDisabledIds: newIds, message: `Post automation ${togglePost === "enable" ? "enabled" : "disabled"}` };
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
              options { name values }
              variants(first: 100) {
                nodes {
                  id
                  title
                  price
                  selectedOptions { name value }
                }
              }
            }
          }
        `, { variables: { id: productId } });
        const json = await response.json();
        const product = json.data?.product;
        const allVariants = product?.variants?.nodes || [];
        if (allVariants.length === 0) return { error: "Product has no variants." };
        const finalVariantId = variantId || allVariants[0].id;
        const productHandle = product?.handle?.trim() || null;
        const productOptions = {
          options: product?.options || [],
          variants: allVariants.map((v) => ({
            id: v.id,
            title: v.title,
            price: v.price,
            selectedOptions: v.selectedOptions,
          })),
        };
        const saved = await saveProductMapping(shop.id, igMediaId, productId, finalVariantId, productHandle, productOptions);
        console.log(`[home] save-mapping ok shop_id=${shop.id} domain=${session.shop} ig_media_id=${igMediaId} product_id=${productId} row_id=${saved?.id ?? "unknown"}`);
        return {
          success: true,
          actionType: "save-mapping",
          message: "Mapping saved.",
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
        console.log(`[home] delete-mapping ok shop_id=${shop.id} domain=${session.shop} ig_media_id=${igMediaId}`);
        return { success: true, actionType: "delete-mapping", message: "Mapping removed.", igMediaId };
      } catch (err) {
        console.error("[home] Error deleting mapping:", err);
        return { error: err.message || "Failed to delete mapping" };
      }
    }

    // ── Load more Instagram posts (cursor pagination) ──────────────────────
    if (actionType === "load-more-media") {
      if (!shop?.id) return { error: "Shop not found" };
      const after = formData.get("after");
      if (!after) return { error: "Missing pagination cursor" };
      try {
        const metaAuthRow = await getMetaAuthWithRefresh(shop.id);
        if (!metaAuthRow) return { error: "Instagram is not connected" };
        const media = await getInstagramMedia(metaAuthRow.ig_business_id || "", shop.id, { limit: 25, after });
        return { success: true, actionType: "load-more-media", media: media.data || [], paging: media.paging || {} };
      } catch (err) {
        console.error("[home] Error loading more Instagram posts:", err);
        return { error: "Failed to load more posts. Please try again." };
      }
    }

    // ── Search products (mapping picker) ───────────────────────────────────
    if (actionType === "search-products") {
      if (!shop?.id) return { error: "Shop not found" };
      const term = String(formData.get("search") || "").trim();
      try {
        // Strip Shopify search-syntax characters so user input can't break the query.
        const sanitized = term.replace(/["*\\():]/g, "");
        const response = await admin.graphql(`
          query searchProducts($first: Int!, $query: String) {
            products(first: $first, query: $query) {
              nodes {
                id
                title
                handle
                variants(first: 100) {
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
        `, { variables: { first: 50, query: sanitized ? `title:*${sanitized}*` : null } });
        const json = await response.json();
        return {
          success: true,
          actionType: "search-products",
          products: json.data?.products?.nodes || [],
          search: term,
        };
      } catch (err) {
        console.error("[home] Error searching products:", err);
        return { error: "Failed to search products. Please try again." };
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
  const { shop, plan, metaAuth, settings, brandVoice, productMappings, missedComments, trialStatus, reviewEligible, deferred } = loaderData || {};
  const { hasAccess, isFree } = usePlanAccess();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isConnected = !!metaAuth;
  const disconnected = searchParams.get("disconnected") === "true";
  const error = searchParams.get("error");

  // Separate fetchers so actions don't conflict
  const connectFetcher = useFetcher();      // OAuth connect / disconnect
  const automationFetcher = useFetcher();   // Automation settings + brand voice
  const postFetcher = useFetcher();         // Per-post toggle, save/delete mapping
  const reviewReportFetcher = useFetcher(); // Fire-and-forget review-prompt logging
  // Ref so the review effect can submit without adding the fetcher (whose
  // identity changes on every state transition) to its dependency array.
  const reviewReportRef = useRef(reviewReportFetcher);
  reviewReportRef.current = reviewReportFetcher;
  const automationFormRef = useRef(null);

  // Automation / brand voice local state
  const [dmAutomationEnabled, setDmAutomationEnabled] = useState(settings?.dm_automation_enabled ?? true);
  const [commentAutomationEnabled, setCommentAutomationEnabled] = useState(settings?.comment_automation_enabled ?? true);
  const [followupEnabled, setFollowupEnabled] = useState(settings?.followup_enabled ?? true);
  const [brandVoiceTone, setBrandVoiceTone] = useState(brandVoice?.tone || "friendly");
  const [brandVoiceCustom, setBrandVoiceCustom] = useState(brandVoice?.custom_instruction || "");
  const [brandVoiceReplyLang, setBrandVoiceReplyLang] = useState(brandVoice?.reply_language || "auto");

  // Sync automation/brand-voice form state from loader data when it changes
  // (initial load or full revalidation). All feed/mapping/picker state lives
  // in <PostsSection> now.
  useEffect(() => {
    if (settings) {
      setDmAutomationEnabled(settings.dm_automation_enabled ?? true);
      setCommentAutomationEnabled(settings.comment_automation_enabled ?? true);
      setFollowupEnabled(settings.followup_enabled ?? true);
    }
    if (brandVoice) {
      setBrandVoiceTone(brandVoice.tone || "friendly");
      setBrandVoiceCustom(brandVoice.custom_instruction || "");
      setBrandVoiceReplyLang(brandVoice.reply_language || "auto");
    }
  }, [settings, brandVoice]);

  // Ask for an App Store review once the merchant has a real win (first
  // attributed order or 20+ sent replies). Uses Shopify's native Reviews API,
  // which is compliant (never incentivized) and enforces its own annual limit.
  // We pace it ourselves with a per-shop localStorage record so we don't ask
  // on every load: re-ask only after REVIEW_COOLDOWN_MS, never more than
  // REVIEW_MAX_ASKS times, and stop forever once the merchant has reviewed (or
  // Shopify reports they already have). Fired from an effect (not a click) per
  // Shopify's guidance; failures are swallowed so it never affects the page.
  useEffect(() => {
    if (!reviewEligible || !shop?.id) return;
    if (typeof window === "undefined" || typeof window.shopify === "undefined") return;
    if (!window.shopify.reviews?.request) return;

    const flagKey = `srai_review_requested_${shop.id}`;

    // Read the pacing record. Tolerates the legacy format (a bare timestamp
    // string written by the previous version) by treating it as one prior ask.
    let record = { lastAt: 0, count: 0, done: false };
    try {
      const raw = window.localStorage.getItem(flagKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "number") {
          record = { lastAt: parsed, count: 1, done: false };
        } else if (parsed && typeof parsed === "object") {
          record = { lastAt: 0, count: 0, done: false, ...parsed };
        }
      }
    } catch {
      // Unparseable/unavailable (e.g. private mode). Proceed with defaults;
      // Shopify's own annual limit is the backstop.
    }

    if (record.done) return;
    if (record.count >= REVIEW_MAX_ASKS) return;
    if (record.lastAt && Date.now() - record.lastAt < REVIEW_COOLDOWN_MS) return;

    const persist = (next) => {
      try {
        window.localStorage.setItem(flagKey, JSON.stringify(next));
      } catch {
        /* ignore — pacing is best-effort */
      }
    };

    // Log the attempt server-side (best-effort) so the admin dashboard can
    // show whether this merchant has been asked and what Shopify decided.
    const report = (result) => {
      try {
        reviewReportRef.current.submit(
          { action: "record-review-prompt", result },
          { method: "post" },
        );
      } catch {
        /* logging only — never let it affect the page */
      }
    };

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const result = await window.shopify.reviews.request();
        // success === true means the modal was shown; code "already-reviewed"
        // means they've already left one. Either way, never ask again.
        const done =
          result?.success === true || result?.code === "already-reviewed";
        persist({ lastAt: Date.now(), count: record.count + 1, done });
        report(result?.success === true ? "shown" : result?.code || "not-shown");
      } catch {
        // Treat a thrown error as an attempt so we still respect the cooldown
        // instead of retrying on the next render.
        persist({ lastAt: Date.now(), count: record.count + 1, done: false });
        report("error");
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reviewEligible, shop?.id]);

  // OAuth redirect — must break out of Shopify iframe
  useEffect(() => {
    if (connectFetcher.data?.oauthUrl) {
      try { window.top.location.href = connectFetcher.data.oauthUrl; }
      catch { window.location.href = connectFetcher.data.oauthUrl; }
    } else if (connectFetcher.data?.success && connectFetcher.data?.message?.includes("disconnected")) {
      navigate("/app?disconnected=true");
    }
  }, [connectFetcher.data, navigate]);

  return (
    <s-page heading="SocialRepl.ai">

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
          <s-text variant="strong">Pro Trial Active</s-text>
          <s-text>
            {" "}You have full Pro access until{" "}
            {new Date(shop.beta_trial_expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
          </s-text>
        </s-banner>
      )}
      {trialStatus && (
        <s-banner tone={trialStatus.daysLeft <= 3 ? "warning" : "success"}>
          <s-text variant="strong">
            {plan?.name === "GROWTH" ? "Growth" : "Pro"} free trial: {trialStatus.daysLeft}{" "}
            {trialStatus.daysLeft === 1 ? "day" : "days"} left
          </s-text>
          <s-text>
            {" "}You have full access — billing starts{" "}
            {new Date(trialStatus.trialEndsAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
          </s-text>
        </s-banner>
      )}

      {/* ── Upgrade prompts ─────────────────────────────────────────────── */}
      {shop && plan && plan.name === "FREE" && shop.usage_count >= plan.cap && (
        <s-banner tone="critical">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">You've reached your {plan.cap}-message limit this month.</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                New DMs won't receive automated responses until next month.
                Upgrade to Growth for 500 messages/mo plus comment automation and brand voice.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">Upgrade now</s-button>
          </div>
        </s-banner>
      )}
      {shop && plan && plan.name === "FREE" && shop.usage_count >= plan.cap * 0.8 && shop.usage_count < plan.cap && (
        <s-banner tone="warning">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">You've used {shop.usage_count} of {plan.cap} messages this month ({Math.round((shop.usage_count / plan.cap) * 100)}%).</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Running low on messages. Upgrade to Growth for 5x the limit plus comment automation and full analytics.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">View plans</s-button>
          </div>
        </s-banner>
      )}
      {plan && plan.name === "FREE" && missedComments > 0 && (
        <s-banner tone="info">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">{missedComments} comment{missedComments === 1 ? "" : "s"} received this month without an automated reply.</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Comment-to-DM automation is available on Growth ($39/mo). Turn comments into checkout links automatically.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="secondary" size="slim">Unlock comment automation</s-button>
          </div>
        </s-banner>
      )}
      {shop && plan && plan.name === "GROWTH" && shop.usage_count >= plan.cap && (
        <s-banner tone="critical">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">You've reached your {plan.cap}-message limit this month.</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Automation is paused until next month. Upgrade to Pro for 10,000 messages/mo, follow-ups, and per-post analytics.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">Go Pro</s-button>
          </div>
        </s-banner>
      )}
      {shop && plan && plan.name === "GROWTH" && shop.usage_count >= plan.cap * 0.8 && shop.usage_count < plan.cap && (
        <s-banner tone="warning">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">You've used {shop.usage_count} of {plan.cap} messages this month ({Math.round((shop.usage_count / plan.cap) * 100)}%).</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Upgrade to Pro for 10,000 messages/mo plus follow-up messages and multi-turn conversations.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">Go Pro</s-button>
          </div>
        </s-banner>
      )}
      {shop && plan && plan.name === "FREE" && shop.usage_count === 0 && !missedComments && (
        <s-banner tone="success">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">Welcome to SocialRepl.ai!</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                You're on the Free plan with {plan.cap} messages/mo. Connect your Instagram account, map products to posts, and DM automation will handle the rest.
                Ready for more? Growth adds comment automation, brand voice, and 500 messages/mo.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="secondary" size="slim">See all plans</s-button>
          </div>
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
                    <s-badge tone="success">Trial</s-badge>
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
                      Connected
                      {/* Username streams in with the deferred data; the row
                          height is fixed so it appends without layout shift. */}
                      <Suspense fallback={null}>
                        <Await resolve={deferred} errorElement={null}>
                          {(d) => (d?.instagramInfo?.username ? ` · @${d.instagramInfo.username}` : "")}
                        </Await>
                      </Suspense>
                    </span>
                  </div>
                  <s-button
                    variant="secondary" size="slim" className="srBtnCompact"
                    onClick={() => {
                      connectFetcher.submit({ action: "disconnect" }, { method: "post" });
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
      <s-section heading="Automation">
        <automationFetcher.Form method="post" ref={automationFormRef}>
          <input type="hidden" name="action" value="update-automation-settings" />
          <input type="hidden" name="dm_automation_enabled" value={dmAutomationEnabled ? "true" : "false"} />
          <input type="hidden" name="comment_automation_enabled" value={commentAutomationEnabled ? "true" : "false"} />
          <input type="hidden" name="followup_enabled" value={followupEnabled ? "true" : "false"} />
          <input type="hidden" name="brand_voice_tone" value={brandVoiceTone || "friendly"} />
          <input type="hidden" name="brand_voice_custom" value={brandVoiceCustom || ""} />
          <input type="hidden" name="brand_voice_reply_language" value={brandVoiceReplyLang || "auto"} />

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
                      <span className="srCardDesc">
                        {hasAccess("GROWTH")
                          ? "Auto-reply to comments with private DMs"
                          : "Upgrade to Growth to unlock comment automation"}
                      </span>
                    </div>
                    <label className="srToggle">
                      <input
                        type="checkbox"
                        checked={hasAccess("GROWTH") ? commentAutomationEnabled : false}
                        onChange={(e) => setCommentAutomationEnabled(e.target.checked)}
                        disabled={!hasAccess("GROWTH")}
                      />
                      <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                    </label>
                  </div>
                </div>
                <div className="srToggleRow srToggleRowLast">
                  <div className="srToggleRowInner">
                    <div className="srToggleRowText">
                      <span className="srCardTitle">Follow-up messages</span>
                      <span className="srCardDesc">
                        {hasAccess("PRO")
                          ? "Send a reminder 23–24 hours after last message if no link click"
                          : "Upgrade to Pro to unlock follow-ups"}
                      </span>
                    </div>
                    <label className="srToggle">
                      <input
                        type="checkbox"
                        checked={hasAccess("PRO") ? followupEnabled : false}
                        onChange={(e) => setFollowupEnabled(e.target.checked)}
                        disabled={!hasAccess("PRO")}
                      />
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
                  <div className="srToggleRow">
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
                  <div className="srToggleRow srToggleRowLast">
                    <div className="srToggleRowText">
                      <span className="srCardTitle">Reply language</span>
                      <span className="srCardDesc">
                        {brandVoiceReplyLang === "auto"
                          ? "Auto: each reply is written in the same language the customer messaged in."
                          : "Replies are always written in the selected language, no matter what language the customer uses."}
                      </span>
                      <select
                        value={brandVoiceReplyLang}
                        onChange={(e) => setBrandVoiceReplyLang(e.target.value)}
                        className="srSelect srInputRow"
                      >
                        <option value="auto">Auto (match customer&apos;s language)</option>
                        <option value="en">English</option>
                        <option value="pt-BR">Portuguese (Brazil)</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="it">Italian</option>
                        <option value="nl">Dutch</option>
                      </select>
                    </div>
                  </div>
                </div>
              </s-box>
            </PlanGate>
          </div>

          <div className="srSaveBtnWrap">
            <button
              type="button"
              className="srPrimaryBtn"
              onClick={() => {
                if (automationFormRef.current) {
                  automationFetcher.submit(automationFormRef.current);
                }
              }}
            >
              {automationFetcher.state === "submitting" ? "Saving…" : "Save settings"}
            </button>
          </div>
        </automationFetcher.Form>
      </s-section>

      {/* ── Your Instagram Posts ───────────────────────────────────────── */}
      {/* Hidden on FREE: post-by-post mapping and per-post automation toggles
          are part of the paid DM/comment automation experience. FREE merchants
          see the upgrade banners above instead.
          Media + products stream in via the deferred loader promise; the
          fixed-size skeleton keeps first paint fast (LCP) with no layout
          shift when the real grid arrives (CLS). */}
      {isConnected && !isFree && (
        <s-section heading="Your Instagram Posts">
          <Suspense fallback={<PostsSectionSkeleton />}>
            <Await
              resolve={deferred}
              errorElement={
                <span className="srCardDesc">
                  Couldn&apos;t load your Instagram posts. Reload the page to try again.
                </span>
              }
            >
              {(resolved) => (
                <PostsSection
                  mediaData={resolved?.mediaData}
                  shopifyProducts={resolved?.shopifyProducts || []}
                  productMappings={productMappings}
                  disabledPostIds={settings?.disabled_post_ids || []}
                  postFetcher={postFetcher}
                />
              )}
            </Await>
          </Suspense>
        </s-section>
      )}

    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
