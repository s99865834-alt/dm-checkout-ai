/**
 * The Shopify Managed Pricing page URL.
 *
 * Pure and dependency-free so it can be tested without Shopify credentials.
 *
 * APP_HANDLE must equal `handle` in shopify.app.toml. Shopify resolves the
 * charges URL by app handle, and an unknown handle does not error: it bounces
 * the merchant out of the app to their Shopify Apps page, which looks exactly
 * like the app crashing. This was hardcoded to the repo name, "dm-checkout-ai",
 * while the app's handle is "socialreplai", so no merchant could ever reach the
 * pricing page and nobody had ever successfully subscribed. billing-url.test.js
 * reads the handle out of shopify.app.toml so a rename cannot break it silently
 * again.
 */
export const APP_HANDLE = "socialreplai";

/**
 * @param {string} shopDomain - e.g. "lovebyluna.myshopify.com"
 * @returns {string|null} Managed Pricing URL, or null without a shop domain.
 */
export function managedPricingUrl(shopDomain) {
  const handle = (shopDomain || "").replace(/\.myshopify\.com$/, "").trim();
  if (!handle) return null;
  return `https://admin.shopify.com/store/${handle}/charges/${APP_HANDLE}/pricing_plans`;
}
