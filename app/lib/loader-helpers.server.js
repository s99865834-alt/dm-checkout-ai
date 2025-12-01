import { authenticate } from "../shopify.server";
import { getShopByDomain } from "./db.server";
import { getPlanConfig } from "./plans";

/**
 * Loader helper that fetches shop data and plan config for use in UI components.
 * 
 * Usage in a loader:
 * ```js
 * export const loader = async ({ request }) => {
 *   const { shop, plan } = await getShopWithPlan(request);
 *   return { shop, plan };
 * };
 * ```
 * 
 * @param {Request} request - The incoming request
 * @returns {Promise<{shop: Object, plan: Object}>} Shop data and plan configuration
 */
export async function getShopWithPlan(request) {
  // Authenticate the request (this also validates the session)
  const { session } = await authenticate.admin(request);
  
  // Get shop domain from session
  const shopDomain = session.shop;
  
  // Fetch shop from database
  let shop = await getShopByDomain(shopDomain);
  
  // If shop doesn't exist in DB, create it with defaults
  if (!shop) {
    // This will be handled by the OAuth flow in Week 3, but for now
    // we'll return null or create it here
    // For Week 2, we'll just return null if shop doesn't exist
    // In production, shops should be created during OAuth
    return {
      shop: null,
      plan: getPlanConfig("FREE"), // Default to FREE plan
    };
  }
  
  // Get plan configuration
  const plan = getPlanConfig(shop.plan);
  
  return {
    shop,
    plan,
  };
}

/**
 * Get shop data only (without plan config).
 * Useful when you already have the plan or don't need it.
 * 
 * @param {Request} request - The incoming request
 * @returns {Promise<Object|null>} Shop data or null
 */
export async function getShop(request) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  return await getShopByDomain(shopDomain);
}

