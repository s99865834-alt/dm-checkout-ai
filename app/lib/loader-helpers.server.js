import { authenticate } from "../shopify.server";
import { getShopByDomain, createOrUpdateShop, ensureUsageMonthCurrent } from "./db.server";
import { getPlanConfig } from "./plans";

/**
 * Loader helper that fetches shop data and plan config for use in UI components.
 * 
 * This function also ensures that if the app is installed (valid session exists),
 * the shop is marked as active in the database. This is a fallback in case
 * the afterAuth hook doesn't run (e.g., on reinstall when session still exists).
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
    // Create shop if it doesn't exist (fallback if afterAuth didn't run)
    try {
      shop = await createOrUpdateShop(shopDomain, {
        plan: "FREE",
        monthly_cap: 25,
        active: true,
      });
      console.log(`[getShopWithPlan] Created shop ${shopDomain} (fallback)`);
    } catch (error) {
      console.error(`[getShopWithPlan] Error creating shop ${shopDomain}:`, error);
      return {
        shop: null,
        plan: getPlanConfig("FREE"), // Default to FREE plan
      };
    }
  } else if (!shop.active) {
    // If shop exists but is inactive, and we have a valid session, mark it as active
    // This handles the case where afterAuth didn't run on reinstall
    try {
      shop = await createOrUpdateShop(shopDomain, {
        plan: shop.plan || "FREE",
        monthly_cap: shop.monthly_cap || 25,
        active: true,
        usage_count: 0, // Reset usage count on reinstall
      });
      console.log(`[getShopWithPlan] Reactivated shop ${shopDomain} (fallback)`);
    } catch (error) {
      console.error(`[getShopWithPlan] Error reactivating shop ${shopDomain}:`, error);
      // Continue with existing shop data even if update fails
    }
  }

  // If we're in a new month, reset usage so the UI shows 0/limit (and DB stays in sync)
  shop = await ensureUsageMonthCurrent(shop);
  
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
  const shop = await getShopByDomain(shopDomain);
  return shop ? await ensureUsageMonthCurrent(shop) : null;
}

