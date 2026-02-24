import { authenticate } from "../shopify.server";
import { getShopByDomain, createOrUpdateShop, ensureUsageMonthCurrent } from "./db.server";
import { getPlanConfig } from "./plans";

/**
 * Loader helper that authenticates, fetches shop data and plan config, and returns
 * the Shopify session and admin client so callers never need to call authenticate.admin again.
 *
 * Usage in a loader:
 * ```js
 * export const loader = async ({ request }) => {
 *   const { shop, plan, admin } = await getShopWithPlan(request);
 *   return { shop, plan };
 * };
 * ```
 *
 * @param {Request} request - The incoming request
 * @returns {Promise<{shop: Object, plan: Object, session: Object, admin: Object}>}
 */
export async function getShopWithPlan(request) {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await getShopByDomain(shopDomain);

  if (!shop) {
    try {
      shop = await createOrUpdateShop(shopDomain, {
        plan: "FREE",
        monthly_cap: 25,
        active: true,
      });
      console.log(`[getShopWithPlan] Created shop ${shopDomain} (fallback)`);
    } catch (error) {
      console.error(`[getShopWithPlan] Error creating shop ${shopDomain}:`, error);
      return { shop: null, plan: getPlanConfig("FREE"), session, admin };
    }
  } else if (!shop.active) {
    try {
      shop = await createOrUpdateShop(shopDomain, {
        plan: shop.plan || "FREE",
        monthly_cap: shop.monthly_cap || 25,
        active: true,
        usage_count: 0,
      });
      console.log(`[getShopWithPlan] Reactivated shop ${shopDomain} (fallback)`);
    } catch (error) {
      console.error(`[getShopWithPlan] Error reactivating shop ${shopDomain}:`, error);
    }
  }

  shop = await ensureUsageMonthCurrent(shop);
  const plan = getPlanConfig(shop.plan);

  return { shop, plan, session, admin };
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

