import { isShopifyAutomatedReviewShop } from "./shopify-review-shop";

/**
 * Whether an app request should leave for Shopify's plan selection page.
 *
 * Shopify does not make merchants pick a plan at install; the app has to send
 * them. Billing routes are exempt because Shopify's welcome link returns there
 * after a charge is approved, before shop.plan has been written.
 *
 * @param {{plan: Object|null, pathname: string, shopDomain: string}} args
 */
export function needsPlanSelection({ plan, pathname, shopDomain }) {
  if (!plan?.locked) return false;
  if (pathname.startsWith("/app/billing")) return false;
  if (isShopifyAutomatedReviewShop(shopDomain)) return false;
  return true;
}
