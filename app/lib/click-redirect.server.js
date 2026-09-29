/**
 * Shared tracked-link resolution for the redirect routes:
 *   /{linkId}            short-link domain (srai.link legacy, socialrepl.ai)
 *   /proxy/go/{linkId}   Shopify app proxy ({store-domain}/a/go/{linkId})
 * Looks up the destination in links_sent and logs the click (browser-like
 * requests only, so crawlers and link previews don't count).
 */

import supabase from "./supabase.server";
import { logClick } from "./db.server";
import {
  buildTrackedLinkPageHtml,
  isLinkPreviewCrawler,
  DEFAULT_LINK_PREVIEW,
} from "./link-preview.server";
import { publicStoreHost, rewriteMyshopifyHost, storefrontProxyUrl } from "./link-attribution";

const PREVIEW_LOOKUP_MS = 2000;

const BROWSER_UA_PATTERNS = [
  "mozilla/",
  "opera",
  "opr/",
];

function looksLikeBrowser(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  if (!ua.trim()) return false;
  return BROWSER_UA_PATTERNS.some((p) => ua.includes(p));
}

async function fetchLinkRow(linkId) {
  const { data: row, error } = await supabase
    .from("links_sent")
    .select("url, shop_id")
    .eq("link_id", linkId)
    .maybeSingle();
  if (error || !row?.url) return null;
  return row;
}

/**
 * The two hosts a click cares about: the public one to show a customer, and
 * whichever storefront host serves this shop's app proxy. A shop with no
 * custom domain has no public host but still has a storefront, and the proxy
 * is mounted there, which is what makes its clicks attributable at all.
 */
async function hostsForShop(shopId) {
  if (!shopId) return { publicHost: null, storefrontHost: null };
  const { data: shop, error } = await supabase
    .from("shops")
    .select("shopify_domain, store_context_json")
    .eq("id", shopId)
    .maybeSingle();
  if (error || !shop) return { publicHost: null, storefrontHost: null };
  const publicHost = publicStoreHost(shop.store_context_json);
  return {
    publicHost,
    storefrontHost: publicHost || shop.shopify_domain || null,
  };
}

/**
 * Resolve a link_id to its destination URL, logging the click when
 * appropriate. Returns the URL string, or null when the link doesn't exist.
 */
export async function resolveTrackedLink(linkId, request) {
  const detail = await resolveTrackedLinkDetail(linkId, request);
  return detail?.url ?? null;
}

/**
 * As resolveTrackedLink, plus the storefront host that serves this shop's app
 * proxy, which serveTrackedLink needs to hand the click to the store instead
 * of sending it straight to the destination.
 */
async function resolveTrackedLinkDetail(linkId, request) {
  if (!linkId) return null;

  let row = await fetchLinkRow(linkId);
  if (!row) {
    // Race guard: Instagram fetches the link preview the instant a DM is
    // delivered, which can arrive before the links_sent insert commits.
    // Links are now persisted before sending, but one brief retry keeps
    // queued sends and any remaining ordering edge from 404ing the preview.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    row = await fetchLinkRow(linkId);
  }
  if (!row?.url) return null;
  const { publicHost, storefrontHost } = await hostsForShop(row.shop_id);
  const url = rewriteMyshopifyHost(row.url, publicHost);

  // Every link type is logged, info_ included. The analytics KPIs filter to
  // checkout links via isCheckoutLinkId before counting, so this moves no
  // number a merchant sees; it just stops browse links being the one thing we
  // send in volume and know nothing about. An unmapped post can only answer
  // with an info_ link, so "does anyone click those?" decides how much the
  // product-mapping gap actually costs.
  if (looksLikeBrowser(request)) {
    const userAgent = request.headers.get("user-agent") || null;
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : null;
    try {
      await logClick({ linkId, userAgent, ip });
    } catch (e) {
      console.warn("[redirect] logClick failed:", e?.message);
    }
  }

  return { url, storefrontHost };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Product title/image for a tracked link, used only by preview crawlers.
 * Best-effort: missing rows or Shopify misses return null and the page
 * still uses the generic checkout title.
 */
export async function loadLinkPreviewMeta(linkId) {
  if (!linkId) return null;
  const { data: row, error } = await supabase
    .from("links_sent")
    .select("product_id, shop_id, url")
    .eq("link_id", linkId)
    .maybeSingle();
  if (error || !row?.shop_id) return null;

  const { data: shop } = await supabase
    .from("shops")
    .select("shopify_domain, store_context_json")
    .eq("id", row.shop_id)
    .maybeSingle();

  const storeName = shop?.store_context_json?.name || null;
  const preview = {
    title: storeName || DEFAULT_LINK_PREVIEW.title,
    // "Checkout on X" is wrong for a browse link: nothing has been chosen
    // yet. Corrected below once we know whether this link is about a product.
    description: storeName ? `Shop ${storeName}` : DEFAULT_LINK_PREVIEW.description,
    imageUrl: null,
  };

  if (row.product_id && shop?.shopify_domain) {
    const { getProductOgPreview } = await import("./shopify-data.server");
    const product = await getProductOgPreview(shop.shopify_domain, row.product_id);
    if (product?.title) {
      preview.title = product.title;
      preview.description = storeName ? `${product.title} on ${storeName}` : product.title;
    }
    if (product?.imageUrl) preview.imageUrl = product.imageUrl;
  }

  // A collection page is more specific than the store thumbnail: title the
  // card after the collection so "Nail Polish" does not preview as the shop.
  if (!row.product_id && shop?.shopify_domain) {
    const { collectionHandleFromUrl } = await import("./collection-match");
    const handle = collectionHandleFromUrl(row.url);
    if (handle) {
      const { getShopCollections, collectionOgPreview } = await import("./shopify-data.server");
      const collection = collectionOgPreview(await getShopCollections(shop.shopify_domain), handle);
      if (collection?.title) {
        preview.title = collection.title;
        preview.description = storeName ? `${collection.title} on ${storeName}` : collection.title;
      }
      if (collection?.imageUrl) preview.imageUrl = collection.imageUrl;
    }
  }

  // Browse links carry no product, so they had no image and Instagram drew an
  // empty card. Also covers a product or collection whose own image lookup
  // came back empty.
  if (!preview.imageUrl && shop?.shopify_domain) {
    const { getShopOgImage } = await import("./shopify-data.server");
    preview.imageUrl = await getShopOgImage(shop.shopify_domain);
  }

  return preview;
}

function htmlRedirectResponse(destinationUrl, preview, { stampCart = false, linkId = null } = {}) {
  const html = buildTrackedLinkPageHtml({
    destinationUrl,
    title: preview?.title,
    description: preview?.description,
    imageUrl: preview?.imageUrl,
    stampCart,
    linkId,
  });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Resolve a tracked link and respond.
 *
 * App-proxy links always return HTML (Shopify follows 302s server-side and
 * that breaks cart cookies). Short-link hosts only return HTML for preview
 * crawlers, so Instagram can read Open Graph tags.
 *
 * @param {string} linkId
 * @param {Request} request
 * @param {{ alwaysHtml?: boolean }} [opts]
 */
export async function serveTrackedLink(linkId, request, { alwaysHtml = false } = {}) {
  const detail = await resolveTrackedLinkDetail(linkId, request);
  const url = detail?.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response("Not Found", { status: 404 });
  }

  const crawler = isLinkPreviewCrawler(request);
  if (!alwaysHtml && !crawler) {
    // Hand the click to the store's own app proxy rather than the
    // destination. Only the storefront's own origin can stamp the cart, so a
    // bare 302 from here meant a shop with no custom domain (20 of 35 active
    // shops) could never attribute a sale: its links fall back to the shared
    // short domain, which cannot touch /cart/update.js. The customer still
    // clicked the short branded link; this is only where it sends them.
    const proxied = storefrontProxyUrl(detail.storefrontHost, linkId);
    return new Response(null, {
      status: 302,
      headers: { Location: proxied || url },
    });
  }

  let preview = DEFAULT_LINK_PREVIEW;
  if (crawler) {
    const extra = await withTimeout(loadLinkPreviewMeta(linkId), PREVIEW_LOOKUP_MS);
    if (extra) preview = extra;
  }

  const stampCart = alwaysHtml && !crawler;
  return htmlRedirectResponse(url, preview, { stampCart, linkId });
}
