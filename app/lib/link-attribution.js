/**
 * Last-click attribution for every link we send, not just checkout.
 *
 * Affiliate default: a click drops a 30-day first-party cookie and stamps
 * the cart. The last click inside that window gets the sale. Discount codes
 * still beat the cookie, because they live on the order itself.
 */

export const ATTRIBUTION_WINDOW_DAYS = 30;
export const ATTRIBUTION_WINDOW_MS = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const REF_COOKIE_NAME = "sr_ref";
export const REF_COOKIE_MAX_AGE_SEC = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60;

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

export function lastClickCookieHeader(linkId) {
  if (!isSafeLinkId(linkId)) return null;
  return `${REF_COOKIE_NAME}=${linkRefValue(linkId)}; Max-Age=${REF_COOKIE_MAX_AGE_SEC}; Path=/; SameSite=Lax`;
}

/**
 * Discount codes live on the order, so they credit even after the window.
 * Cookie, cart attribute, and landing_site only credit a link that was
 * sent or clicked in the last 30 days.
 */
export function shouldCreditLink({ lastTouchAt, fromDiscountCode = false, now = Date.now() } = {}) {
  if (fromDiscountCode) return true;
  return isAttributionInWindow(lastTouchAt, now);
}
