/**
 * Shopify App Store automated review / security-scan shops.
 *
 * Those installs hit the live app URL. They are throwaway shops Shopify
 * creates for the scan (`app-review-…-primary`, `app-review-…-victim`,
 * `cross-shop-missing-…`). They are not merchants, must not become /admin
 * rows, and their expected API misses must not be logged as errors.
 */

export function isShopifyAutomatedReviewShop(shopDomain) {
  if (!shopDomain || typeof shopDomain !== "string") return false;
  const handle = shopDomain.toLowerCase().trim();
  const suffix = ".myshopify.com";
  if (!handle.endsWith(suffix)) return false;
  const name = handle.slice(0, -suffix.length);
  return name.startsWith("app-review-") || name.startsWith("cross-shop-");
}

export function excludeAutomatedReviewShops(shops) {
  return (shops || []).filter((s) => !isShopifyAutomatedReviewShop(s?.shopify_domain));
}

/**
 * Shopify's sanitizeHost throws TypeError Invalid URL when the scanner
 * sends a numeric or garbage `host` query. That is a bad request, not a crash.
 */
export function isMalformedShopifyHostError(error) {
  if (error == null) return false;
  if (typeof Response !== "undefined" && error instanceof Response) return false;
  let current = error;
  for (let i = 0; i < 5 && current; i += 1) {
    if (current.code === "ERR_INVALID_URL") return true;
    const msg = String(current.message || "");
    if (msg === "Invalid URL" || /^Invalid URL\b/.test(msg)) return true;
    current = current.cause;
  }
  return false;
}

/** GraphQL / Admin API 404: shop gone, scanner fake shop, or closed store. */
export function isShopNotFoundError(error) {
  if (!error) return false;
  if (error.networkStatusCode === 404 || error.response?.code === 404) return true;
  const msg = String(error.message || "");
  return /GraphQL Client: Not Found/i.test(msg) || /404\s+Not Found/i.test(msg);
}
