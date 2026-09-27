/**
 * Last-click attribution for every link we send, not just checkout.
 *
 * A click stamps the cart with the link that sent it, and the reference rides
 * that cart onto the order. The last click inside a 30-day window gets the
 * sale. A discount code credits the sale only when the cart and the landing
 * URL carry no link id, so a later click is never overwritten by an older
 * code.
 */

export const ATTRIBUTION_WINDOW_DAYS = 30;
export const ATTRIBUTION_WINDOW_MS = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function linkRefValue(linkId) {
  return typeof linkId === "string" && linkId ? `link_${linkId}` : null;
}

export function extractLinkIdFromRef(value) {
  if (typeof value !== "string" || !value.startsWith("link_")) return null;
  const id = value.slice("link_".length);
  return id || null;
}

export function isSafeLinkId(linkId) {
  return typeof linkId === "string" && /^[a-zA-Z0-9_]{4,64}$/.test(linkId);
}

export function isAttributionInWindow(touchedAt, now = Date.now()) {
  if (!touchedAt) return false;
  const t = new Date(touchedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= ATTRIBUTION_WINDOW_MS && now - t >= 0;
}

/**
 * Add ref + UTMs to any storefront URL. Cart attributes only belong on
 * checkout permalinks: Shopify ignores attributes[ref] on a collection page.
 */
export function appendAttributionParams(url, linkId, { cartAttribute = false, campaign = "ig_link" } = {}) {
  if (!url || !linkId) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const ref = linkRefValue(linkId);
  if (!parsed.searchParams.get("ref")) parsed.searchParams.set("ref", ref);
  if (cartAttribute && !parsed.searchParams.get("attributes[ref]")) {
    parsed.searchParams.set("attributes[ref]", ref);
  }
  if (!parsed.searchParams.get("utm_source")) parsed.searchParams.set("utm_source", "instagram");
  if (!parsed.searchParams.get("utm_medium")) parsed.searchParams.set("utm_medium", "ig_dm");
  if (!parsed.searchParams.get("utm_campaign")) parsed.searchParams.set("utm_campaign", campaign);
  return parsed.toString();
}

/**
 * Custom domain from store context. myshopify.com is not a public host:
 * a cart stamped there is a different cart from the one on the real domain.
 */
export function publicStoreHost(storeContext) {
  const host = storeContext?.primaryDomain?.host;
  if (typeof host !== "string") return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed || trimmed.endsWith(".myshopify.com") || !/^[a-z0-9.-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Old checkout links were stored on *.myshopify.com. The click arrives on the
 * public domain, so the cart stamp has to send the customer there too.
 */
export function rewriteMyshopifyHost(destinationUrl, publicHost) {
  if (!publicHost || !destinationUrl) return destinationUrl;
  let parsed;
  try {
    parsed = new URL(destinationUrl);
  } catch {
    return destinationUrl;
  }
  if (!parsed.hostname.endsWith(".myshopify.com")) return destinationUrl;
  parsed.hostname = publicHost;
  parsed.protocol = "https:";
  return parsed.toString();
}

/**
 * Which signal credits the order. Cart is the last click we stamped. Landing
 * covers the same session when the stamp did not stick. The discount code is
 * the fallback for a purchase that carried neither.
 */
export function chooseAttributionSource({
  cartLinkId = null,
  landingLinkId = null,
  discountLinkId = null,
  cartInWindow = false,
  landingInWindow = false,
} = {}) {
  if (cartLinkId && cartInWindow) return { linkId: cartLinkId, source: "cart" };
  if (landingLinkId && landingInWindow) return { linkId: landingLinkId, source: "landing" };
  if (discountLinkId) return { linkId: discountLinkId, source: "discount" };
  return { linkId: null, source: null };
}

/**
 * Discount codes live on the order, so they credit even after the window.
 * A cart attribute or landing_site only credits a link that was sent or
 * clicked in the last 30 days.
 */
export function shouldCreditLink({ lastTouchAt, fromDiscountCode = false, now = Date.now() } = {}) {
  if (fromDiscountCode) return true;
  return isAttributionInWindow(lastTouchAt, now);
}
