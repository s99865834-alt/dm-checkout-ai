import { Suspense, useEffect, useState, useRef } from "react";
import { Await, useFetcher, useSearchParams, useNavigate, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuthWithRefresh, getInstagramAccountInfo, getInstagramMedia, deleteMetaAuth, ensureInstagramWebhookSubscription, checkInstagramMessageAccess } from "../lib/meta.server";
import { getSettings, updateSettings, updateFeaturedProduct, getBrandVoice, updateBrandVoice, getProductMappings, saveProductMapping, deleteProductMapping, getMissedCommentCount, getAttributedRevenueThisMonth, getAttributionCount, shopHasLinkClick, getLastInboundMessageAt, recordReviewPrompt, getCompetingToolStatus, getStoryMessageCount } from "../lib/db.server";
import { getCurrentSubscription, getTrialStatus } from "../lib/billing.server";
import { cached, invalidateCached } from "../lib/loader-cache.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";
import { PostsSection, PostsSectionSkeleton } from "../components/home/PostsSection";
import { DefaultProductSection } from "../components/home/DefaultProductSection";

const META_APP_ID = process.env.META_APP_ID;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

// Review-prompt attempt throttle (per device). Real pacing is Shopify's:
// the Reviews API only ever displays the modal once per 60 days and 3x per
// 365 days, and never on mobile / already-reviewed / recently-installed.
// We must NOT add our own ask-count on top — declined attempts (e.g.
// code "mobile-app" on every Shopify-mobile-app visit) would silently burn
// through a local cap without the merchant ever seeing the modal. We only
// throttle how often we *call* the API so page loads aren't spammy.
const REVIEW_RETRY_MS = 24 * 60 * 60 * 1000; // one attempt per device per day

// Server-side cache TTLs for slow, slow-changing loader data. Product catalog
// and Instagram media tolerate a few minutes of staleness; trial status only
// changes on plan events (which invalidate it explicitly in the billing routes).
const PRODUCTS_TTL_MS = 5 * 60 * 1000;
const IG_TTL_MS = 5 * 60 * 1000;
const TRIAL_TTL_MS = 15 * 60 * 1000;
// Re-assert the Instagram webhook subscription at most once a day — without
// it Meta delivers no message/comment events for the account (see
// ensureInstagramWebhookSubscription).
const IG_SUBSCRIBE_TTL_MS = 24 * 60 * 60 * 1000;
// Message-access probe (is the merchant's "Allow access to messages" toggle
// on?). Cached briefly so repeat loads don't re-hit the API; the "Check
// again" action busts this cache for instant feedback.
const MSG_ACCESS_TTL_MS = 10 * 60 * 1000;

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
  let monthRevenue = { total: 0, currency: "USD" };
  let trialStatus = null;
  let reviewEligible = false;
  let lastInboundMessageAt = null;
  let messageAccess = "unknown";
  let competingTool = { detected: false, appId: null, conversations: 0, intercepted: 0 };
  let storyMessages = 0;

  if (shop?.id) {
    let attributionCount = 0;
    let hasLinkClick = false;
    [metaAuth, settings, brandVoice, productMappings, missedComments, monthRevenue, trialStatus, attributionCount, hasLinkClick, lastInboundMessageAt, messageAccess, competingTool, storyMessages] =
      await Promise.all([
        getMetaAuthWithRefresh(shop.id),
        getSettings(shop.id),
        getBrandVoice(shop.id),
        getProductMappings(shop.id).catch(() => []),
        // Only meaningful once comment access has actually lapsed: during the
        // window comments are being answered, so nothing is being missed.
        plan?.name === "FREE" && !plan?.comments ? getMissedCommentCount(shop.id) : Promise.resolve(0),
        // This month's attributed revenue, for the honest ROI banner
        // ("drove $X — Growth costs $39"). Only shown when it's in the
        // merchant's favor, so fetching for FREE/GROWTH is enough.
        plan?.name !== "PRO"
          ? getAttributedRevenueThisMonth(shop.id).catch(() => ({ total: 0, currency: "USD" }))
          : Promise.resolve({ total: 0, currency: "USD" }),
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
        shopHasLinkClick(shop.id),
        // Message-access health: proof that webhook events actually reach us
        // (Meta's "Allow access to messages" toggle isn't queryable via API).
        getLastInboundMessageAt(shop.id),
        // Deterministic probe of the toggle itself (via the documented error
        // messaging APIs return while it's off). Cached; "unknown" on failure.
        // The probe is a live Meta API call that can take seconds on a cold
        // cache — it must never hold the whole first paint hostage (this was
        // the multi-second blank screen on mobile). Budget it: on timeout the
        // client gets "pending" and immediately re-requests via the
        // check-message-access action; the probe keeps running here and warms
        // the cache, so that re-check usually returns instantly.
        Promise.race([
          cached(`igmsgaccess:${shop.id}`, MSG_ACCESS_TTL_MS, () =>
            checkInstagramMessageAccess(shop.id),
          ).catch(() => "unknown"),
          new Promise((resolve) => setTimeout(() => resolve("pending"), 1500)),
        ]),
        // Something other than us answering this Instagram account, from
        // refused comment replies (and, in theory, foreign echo app_ids).
        // Powers the contested-inbox banner so a quiet dashboard gets
        // explained instead of looking broken.
        getCompetingToolStatus(shop.id).catch(() => ({
          detected: false,
          appId: null,
          conversations: 0,
          intercepted: 0,
        })),
        // Story replies and mentions received this month. Only fetched when
        // the shop can't act on them, since the number exists to explain the
        // silence and quantify what upgrading would unlock.
        plan?.stories ? Promise.resolve(0) : getStoryMessageCount(shop.id).catch(() => 0),
      ]);
    // Ask only once a customer has actually done something: an attributed
    // order, or at minimum a click on a link we sent. The old bar was 20
    // replies sent, which measures the app running rather than working, and it
    // spent Shanesecares' one-per-60-days ask while they had zero attributed
    // orders and two checkout links to their name.
    reviewEligible = attributionCount >= 1 || hasLinkClick;
  }

  // Slow externals, streamed to the client as one promise (not awaited here).
  // Each leg is failure-safe and cached so repeat loads inside the TTL are
  // instant. Bundled into a single promise so the posts section renders once.
  const shopId = shop?.id;
  const igBusinessId = metaAuth?.ig_business_id || null;
  const hasIg = !!metaAuth && (!!igBusinessId || metaAuth.auth_type === "instagram");
  const deferred = (async () => {
    if (!shopId) return { shopifyProducts: [], instagramInfo: null, mediaData: null };
    // Self-heal the per-account webhook subscription (daily, best-effort,
    // off the critical path). Result is unused; failures resolve to null.
    if (hasIg) {
      cached(`igsub:${shopId}`, IG_SUBSCRIBE_TTL_MS, () =>
        ensureInstagramWebhookSubscription(shopId),
      ).catch(() => null);
    }
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

  return { shop, plan, metaAuth, settings, brandVoice, productMappings, missedComments, monthRevenue, trialStatus, reviewEligible, lastInboundMessageAt, messageAccess, competingTool, storyMessages, deferred };
};

export const action = async ({ request }) => {
  try {
    const { session, shop, admin, plan } = await getShopWithPlan(request);

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

    // ── Re-check Instagram message access (the "Check again" button) ──────
    if (actionType === "check-message-access") {
      if (!shop?.id) return { error: "Shop not found" };
      invalidateCached(`igmsgaccess:${shop.id}`);
      const messageAccess = await cached(`igmsgaccess:${shop.id}`, MSG_ACCESS_TTL_MS, () =>
        checkInstagramMessageAccess(shop.id),
      ).catch(() => "unknown");
      return { success: true, actionType: "check-message-access", messageAccess };
    }

    // ── Disconnect Instagram ───────────────────────────────────────────────
    if (actionType === "disconnect") {
      if (!shop?.id) return { error: "Shop not found" };
      await deleteMetaAuth(shop.id);
      // Cached IG data belongs to the disconnected account; drop it so a
      // reconnect doesn't briefly show the old account's posts.
      invalidateCached(`iginfo:${shop.id}`);
      invalidateCached(`igmedia:${shop.id}`);
      invalidateCached(`igmsgaccess:${shop.id}`);
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

    // ── Default product (PRO) ──────────────────────────────────────────────
    // The product answered with when nothing else identifies one: a story
    // reply, a story mention, or a shared post with no mapping. Gated here as
    // well as in the UI, so a downgraded shop can't keep setting it.
    if (actionType === "save-default-product" || actionType === "clear-default-product") {
      if (!shop?.id) return { error: "Shop not found" };
      if (!plan?.defaultProduct) return { error: "A default product is a Pro feature." };

      const clearing = actionType === "clear-default-product";
      const productId = clearing ? null : formData.get("productId");
      if (!clearing && !productId) return { error: "Choose a product first" };

      try {
        await updateFeaturedProduct(shop.id, productId, clearing ? null : formData.get("variantId") || null);
        return {
          success: true,
          actionType,
          message: clearing ? "Default product cleared." : "Default product saved.",
        };
      } catch (err) {
        console.error("[home] Error saving default product:", err);
        return { error: err.message || "Failed to save the default product" };
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

/* Tiny refresh icon that re-probes message access; spins while the check is
   in flight. Used on the green statuses where a full button would be noisy. */
function RecheckIconButton({ onClick, checking }) {
  return (
    <button
      type="button"
      className={`srIGHealthRecheckIcon${checking ? " srIGHealthRecheckSpinning" : ""}`}
      onClick={onClick}
      disabled={checking}
      aria-label="Check message access again"
      title="Check again"
    >
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  );
}

export default function Index() {
  const loaderData = useLoaderData();
  const { shop, plan, metaAuth, settings, brandVoice, productMappings, missedComments, monthRevenue, trialStatus, reviewEligible, lastInboundMessageAt, messageAccess, competingTool, storyMessages, deferred } = loaderData || {};
  const { hasAccess, isFree } = usePlanAccess();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isConnected = !!metaAuth;
  const disconnected = searchParams.get("disconnected") === "true";
  const justConnected = searchParams.get("connected") === "true";
  const error = searchParams.get("error");

  // Message-access status: the "Check again" button re-probes via a fetcher;
  // prefer its (fresher) result over the loader's cached one.
  const accessFetcher = useFetcher();
  const messageAccessUi = accessFetcher.data?.messageAccess ?? messageAccess ?? "unknown";
  const accessChecking = accessFetcher.state !== "idle";
  const recheckMessageAccess = () =>
    accessFetcher.submit({ action: "check-message-access" }, { method: "post" });

  // "pending" means the loader's probe timed out to protect first paint —
  // finish the check client-side (the server cache is warming, so this is
  // usually instant).
  useEffect(() => {
    if (messageAccessUi === "pending" && accessFetcher.state === "idle" && !accessFetcher.data) {
      recheckMessageAccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageAccessUi, accessFetcher.state, accessFetcher.data]);

  // Separate fetchers so actions don't conflict
  const connectFetcher = useFetcher();      // OAuth connect / disconnect
  const automationFetcher = useFetcher();   // Automation settings + brand voice
  const postFetcher = useFetcher();         // Per-post toggle, save/delete mapping
  const defaultProductFetcher = useFetcher(); // Default product picker (PRO)

  // Which half of the Instagram section is showing (Pro only; see showStories).
  const [igTab, setIgTab] = useState("posts");
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
  // which is compliant (never incentivized) and enforces all real pacing
  // itself: max once per 60 days, 3x per 365 days, never on mobile devices
  // or after the merchant reviewed. We only throttle attempts (once per
  // device per day) and stop for good on "already-reviewed". Fired from an
  // effect (not a click) per Shopify's guidance; failures are swallowed so
  // it never affects the page.
  useEffect(() => {
    if (!reviewEligible || !shop?.id) return;
    if (typeof window === "undefined" || typeof window.shopify === "undefined") return;
    if (!window.shopify.reviews?.request) return;

    // v2: the v1 record counted Shopify's DECLINES (mobile-app, cooldown…)
    // against a local 3-ask lifetime cap, permanently disabling the prompt on
    // devices that never displayed it. New key so poisoned v1 records are
    // ignored; Shopify's own annual limit backstops any re-asks.
    const flagKey = `srai_review_v2_${shop.id}`;

    let record = { lastAttemptAt: 0, done: false };
    try {
      const raw = window.localStorage.getItem(flagKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          record = { lastAttemptAt: 0, done: false, ...parsed };
        }
      }
    } catch {
      // Unparseable/unavailable (e.g. private mode). Proceed with defaults;
      // Shopify's own rate limits are the backstop.
    }

    if (record.done) return;
    if (record.lastAttemptAt && Date.now() - record.lastAttemptAt < REVIEW_RETRY_MS) return;

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
        // "already-reviewed" is terminal — stop calling on this device.
        // Everything else (shown, mobile-app, cooldown-period, …) just sets
        // the daily attempt throttle; Shopify decides whether a future
        // attempt displays anything.
        persist({ lastAttemptAt: Date.now(), done: result?.code === "already-reviewed" });
        report(result?.success === true ? "shown" : result?.code || "not-shown");
      } catch {
        persist({ lastAttemptAt: Date.now(), done: false });
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

  // Post mapping is normally hidden on FREE, since per-post mapping and toggles
  // are part of the paid experience. It has to be visible during the free
  // comment window though: comment-to-DM sends the checkout link for the
  // product mapped to that post, so a merchant who cannot map products cannot
  // watch the feature do the thing it is being judged on.
  const showPosts = isConnected && (!isFree || plan?.comments);
  // Stories are Pro. Non-Pro shops get the story-replies banner further up
  // instead, which is the honest place to make that argument.
  const showStories = isConnected && plan?.defaultProduct;

  // Both panels await the same deferred promise, so mounting both costs one
  // fetch. The skeleton is fixed-size to keep first paint fast (LCP) with no
  // layout shift when the real grid arrives (CLS).
  const postsPanel = (
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
  );

  const storiesPanel = (
    <Suspense fallback={<span className="srCardDesc">Loading your products…</span>}>
      <Await
        resolve={deferred}
        errorElement={
          <span className="srCardDesc">
            Couldn&apos;t load your products. Reload the page to try again.
          </span>
        }
      >
        {(resolved) => (
          <DefaultProductSection
            settings={settings}
            shopifyProducts={resolved?.shopifyProducts || []}
            fetcher={defaultProductFetcher}
          />
        )}
      </Await>
    </Suspense>
  );

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
      {/* Post-connect checkpoint: the moment they land back from Instagram
          OAuth, tell them definitively whether they're done or one step away. */}
      {justConnected && isConnected && !error && (
        messageAccessUi === "on" ? (
          <s-banner tone="success">
            <s-text variant="strong">Instagram connected — you&apos;re all set!</s-text>
            <s-text> Message access is verified and automation is live.</s-text>
          </s-banner>
        ) : messageAccessUi === "pending" || accessChecking ? (
          <s-banner tone="info">
            <s-text variant="strong">Instagram connected.</s-text>
            <s-text> Verifying message access…</s-text>
          </s-banner>
        ) : (
          <s-banner tone="warning">
            <s-text variant="strong">Instagram connected — one step left.</s-text>
            <s-text>
              {" "}Instagram needs to allow message access before automation can reply.
              Follow the steps in the Plan &amp; Instagram section below.
            </s-text>
          </s-banner>
        )
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
                Upgrade to Growth for 1,000 messages/mo plus comment automation and brand voice.
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
      {/* Honest ROI report: only rendered when tracked sales actually exceed
          the Growth price, so it reads as a report, not an ad. */}
      {plan && plan.name === "FREE" && (monthRevenue?.total || 0) >= 39 && (
        <s-banner tone="success">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">
                SocialRepl.ai drove {new Intl.NumberFormat("en-US", { style: "currency", currency: monthRevenue.currency || "USD" }).format(monthRevenue.total)} in tracked sales this month.
              </span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Growth costs $39/mo and adds comment automation, brand voice, and 1,000 messages — it would already be paying for itself.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">Upgrade to Growth</s-button>
          </div>
        </s-banner>
      )}
      {plan && plan.name === "GROWTH" && (monthRevenue?.total || 0) >= 78 && (
        <s-banner tone="success">
          <span className="srTextStrong">
            SocialRepl.ai drove {new Intl.NumberFormat("en-US", { style: "currency", currency: monthRevenue.currency || "USD" }).format(monthRevenue.total)} in tracked sales this month
          </span>
          <span className="srCardDesc">
            {" "}— {Math.round((monthRevenue.total / 39) * 10) / 10}x its $39/mo cost.
          </span>
        </s-banner>
      )}
      {/* Comment window is open: show what's running and how long is left, so
          the day it stops is expected rather than mistaken for a fault. */}
      {plan?.commentTrial?.granting && (
        <s-banner tone={plan.commentTrial.daysLeft <= 3 ? "warning" : "success"}>
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">
                Comment automation is on for {plan.commentTrial.daysLeft} more{" "}
                {plan.commentTrial.daysLeft === 1 ? "day" : "days"}
              </span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Every comment with buying interest gets a DM with a checkout link, and any resulting
                sale shows up in Analytics. Your allowance is raised to {plan.cap} messages for the
                window so comment volume doesn&apos;t cut it short. Map products to your posts now so
                you can see what it earns. Keeping it costs $39/mo on Growth.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="secondary" size="slim">See plans</s-button>
          </div>
        </s-banner>
      )}
      {/* Window has closed. They have seen it work, so this is the moment the
          number carries weight. */}
      {plan && plan.name === "FREE" && missedComments > 0 && (
        <s-banner tone="warning">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">
                {missedComments} comment{missedComments === 1 ? "" : "s"} with buying interest went unanswered this month
              </span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                {plan.commentTrial?.expired
                  ? "Your free comment window has ended, so these went without a reply. "
                  : "Comment replies aren't included on Free. "}
                On Growth ($39/mo) each of these customers would have received a DM with an answer
                and a checkout link. The actual comments are listed in Analytics.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">Upgrade to Growth</s-button>
          </div>
        </s-banner>
      )}
      {/* Story replies are Pro-only. Without this the merchant just sees an
          inbox the app ignored, which is how the comment paywall lost a store. */}
      {plan && !plan.stories && storyMessages > 0 && (
        <s-banner tone="info">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">
                {storyMessages} story {storyMessages === 1 ? "reply" : "replies"} came in this month and weren&apos;t answered
              </span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Story replies are some of the warmest messages you get: someone watched your story
                and reacted. Pro ($99/mo) answers them automatically with a product link.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">Upgrade to Pro</s-button>
          </div>
        </s-banner>
      )}
      {shop && plan && plan.name === "GROWTH" && shop.usage_count >= plan.cap && (
        <s-banner tone="critical">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">You've reached your {plan.cap}-message limit this month.</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                Automation is paused until next month. Upgrade to Pro for story replies, follow-ups, per-post analytics, and 10,000 messages/mo.
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
                Upgrade to Pro for story replies, follow-up messages, and 10,000 messages/mo.
              </span>
            </div>
            <s-button href="/app/billing/select" variant="primary" size="slim">Go Pro</s-button>
          </div>
        </s-banner>
      )}
      {/* Contested inbox: something else is answering this account. Explain why
          the dashboard may look quiet and put the choice with the merchant
          instead of silently losing the race to reply. */}
      {isConnected && competingTool?.detected && (
        <s-banner tone="warning">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">
                {competingTool.intercepted > 0
                  ? `${competingTool.intercepted} of your comment replies couldn't be sent this week`
                  : "Another messaging tool appears to be replying on this Instagram account"}
              </span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                {competingTool.intercepted > 0 ? (
                  <>
                    Instagram allows only one reply per comment, and something answered these
                    first. Usually that&apos;s Instagram&apos;s own automated replies or another
                    automation app, though it can also be you replying by hand. If it isn&apos;t
                    you, switching the other one off lets SocialRepl.ai answer with the real
                    product details and a checkout link, so the sales it drives show up in
                    Analytics.
                  </>
                ) : (
                  <>
                    To keep customers from getting duplicate replies, SocialRepl.ai steps aside in
                    conversations that have already been answered. If you want SocialRepl.ai
                    handling your messages, with product answers, checkout links, and sale
                    attribution, turn off message automation in the other tool.
                  </>
                )}
              </span>
            </div>
            <s-button href="/app/support" variant="secondary" size="slim">How to fix</s-button>
          </div>
        </s-banner>
      )}
      {shop && plan && plan.name === "FREE" && shop.usage_count === 0 && !missedComments && (
        <s-banner tone="success">
          <div className="srHStack" style={{ gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <span className="srTextStrong">Welcome to SocialRepl.ai!</span>
              <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                You're on the Free plan with {plan.cap} messages/mo. Connect your Instagram and comment
                automation switches on free for 14 days, so you can see it answer real customers before
                you decide anything. Map products to your posts to get the most out of it.
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
                <>
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

                  {/* Message-access health, three states:
                      - "on": the API probe verified the toggle is enabled → green
                      - "off": Meta returned the specific "owner has disabled
                        access" error → red, with fix steps and a Check again
                        button that re-probes instantly
                      - "unknown": probe inconclusive → fall back to proof
                        (green if we've ever received a message, amber otherwise) */}
                  {messageAccessUi === "pending" ? (
                    <span className="srCardDesc srIGHealthLine" style={{ color: "#6d7175" }}>
                      Checking message access…
                    </span>
                  ) : messageAccessUi === "off" ? (
                    <div className="srIGHealthBox">
                      <s-box padding="tight" borderRadius="base" background="subdued">
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span className="srCardTitle srIGHealthTitle" style={{ color: "#d82c0d" }}>
                            ✕ Instagram is blocking message access
                          </span>
                          <span className="srCardDesc srIGHealthText">
                            Your Instagram account has &ldquo;Allow access to messages&rdquo; turned off,
                            so automation can&apos;t see or reply to DMs. In the{" "}
                            <strong>Instagram app</strong> on your phone, go to{" "}
                            <strong>Settings → Messages and story replies → Message requests</strong>{" "}
                            and turn on <strong>&ldquo;Allow access to messages&rdquo;</strong> (under Connected tools).
                            Then come back and tap Check again.
                          </span>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <s-button
                              variant="primary" size="slim" className="srBtnCompact"
                              onClick={recheckMessageAccess}
                              disabled={accessChecking}
                            >
                              {accessChecking ? "Checking…" : "Check again"}
                            </s-button>
                            <s-button href="/app/support" variant="secondary" size="slim" className="srBtnCompact">
                              Step-by-step fix & FAQs
                            </s-button>
                          </div>
                        </div>
                      </s-box>
                    </div>
                  ) : messageAccessUi === "on" ? (
                    <span className="srCardDesc srIGHealthLine" style={{ color: "#1a7f37" }}>
                      ✓ Message access verified
                      {lastInboundMessageAt &&
                        ` — last message ${new Date(lastInboundMessageAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                      <RecheckIconButton onClick={recheckMessageAccess} checking={accessChecking} />
                    </span>
                  ) : lastInboundMessageAt ? (
                    <span className="srCardDesc srIGHealthLine" style={{ color: "#1a7f37" }}>
                      ✓ Message access working — last Instagram message received{" "}
                      {new Date(lastInboundMessageAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      <RecheckIconButton onClick={recheckMessageAccess} checking={accessChecking} />
                    </span>
                  ) : (
                    <div className="srIGHealthBox">
                      <s-box padding="tight" borderRadius="base" background="subdued">
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span className="srCardTitle srIGHealthTitle" style={{ color: "#9a6700" }}>
                            ⚠ Couldn&apos;t verify message access right now
                          </span>
                          <span className="srCardDesc srIGHealthText">
                            Instagram didn&apos;t give us a clear answer when we checked your message-access
                            setting — usually just a temporary hiccup on Instagram&apos;s side. Tap{" "}
                            <strong>Check again</strong> and this will normally turn green right away.
                            If it keeps showing, confirm the setting in the <strong>Instagram app</strong>:{" "}
                            <strong>Settings → Messages and story replies → Message requests</strong> →
                            turn on <strong>&ldquo;Allow access to messages&rdquo;</strong> (under Connected tools).
                          </span>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <s-button
                              variant="secondary" size="slim" className="srBtnCompact"
                              onClick={recheckMessageAccess}
                              disabled={accessChecking}
                            >
                              {accessChecking ? "Checking…" : "Check again"}
                            </s-button>
                            <s-button href="/app/support" variant="secondary" size="slim" className="srBtnCompact">
                              Step-by-step fix & FAQs
                            </s-button>
                          </div>
                        </div>
                      </s-box>
                    </div>
                  )}
                </>
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
                      <span className="srCardDesc">Process and reply to Instagram DMs. If you reply to a customer yourself, the AI steps aside in that conversation for 6 hours so it never talks over you.</span>
                    </div>
                    <label className="srToggle" aria-label="DM automation">
                      <input type="checkbox" checked={dmAutomationEnabled} onChange={(e) => setDmAutomationEnabled(e.target.checked)} />
                      <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                    </label>
                  </div>
                </div>
                <div className="srToggleRow">
                  <div className="srToggleRowInner">
                    <div className="srToggleRowText">
                      <span className="srCardTitle">Comment automation</span>
                      {/* Keyed off plan.comments, not the plan name: during the
                          free window this is genuinely running, and a disabled
                          toggle reading "upgrade to unlock" while the AI is
                          actively answering comments is the kind of mixed signal
                          that makes a merchant distrust the whole dashboard. */}
                      <span className="srCardDesc">
                        {plan?.commentTrial?.granting
                          ? `Auto-reply to comments with private DMs. Free for ${plan.commentTrial.daysLeft} more ${plan.commentTrial.daysLeft === 1 ? "day" : "days"}.`
                          : plan?.comments
                            ? "Auto-reply to comments with private DMs"
                            : "Upgrade to Growth to unlock comment automation"}
                      </span>
                    </div>
                    <label className="srToggle" aria-label="Comment automation">
                      <input
                        type="checkbox"
                        checked={plan?.comments ? commentAutomationEnabled : false}
                        onChange={(e) => setCommentAutomationEnabled(e.target.checked)}
                        disabled={!plan?.comments}
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
                    <label className="srToggle" aria-label="Follow-up messages">
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
            <PlanGate capability="brandVoice" feature="Brand Voice">
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

      {/* ── Your Instagram: posts, and stories on Pro ──────────────────── */}
      {showStories ? (
        /* Pro: posts and stories are two halves of "which product does this
           message mean", so they share one section. Both panels mount and one
           is hidden rather than swapped out, so switching tabs keeps an open
           product picker and costs no refetch (they await the same promise). */
        <s-section heading="Your Instagram">
          <div className="srTabs" role="tablist" aria-label="Instagram automation">
            <button
              type="button"
              role="tab"
              id="sr-tab-posts"
              aria-controls="sr-panel-posts"
              aria-selected={igTab === "posts"}
              className="srTab"
              onClick={() => setIgTab("posts")}
            >
              Posts
            </button>
            <button
              type="button"
              role="tab"
              id="sr-tab-stories"
              aria-controls="sr-panel-stories"
              aria-selected={igTab === "stories"}
              className="srTab"
              onClick={() => setIgTab("stories")}
            >
              Stories
            </button>
          </div>
          <div
            role="tabpanel"
            id="sr-panel-posts"
            aria-labelledby="sr-tab-posts"
            hidden={igTab !== "posts"}
          >
            {postsPanel}
          </div>
          <div
            role="tabpanel"
            id="sr-panel-stories"
            aria-labelledby="sr-tab-stories"
            hidden={igTab !== "stories"}
          >
            {storiesPanel}
          </div>
        </s-section>
      ) : (
        showPosts && <s-section heading="Your Instagram Posts">{postsPanel}</s-section>
      )}

    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

// Shopify boundary: lets the library's special re-auth responses (thrown by
// authenticate.admin when the session token is stale — common on mobile,
// where the webview idles longer) be handled with the right headers instead
// of rendering an error screen.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
