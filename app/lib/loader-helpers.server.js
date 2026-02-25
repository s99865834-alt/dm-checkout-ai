import { authenticate } from "../shopify.server";
import { getShopByDomain, createOrUpdateShop, ensureUsageMonthCurrent, getStoredStoreContext, saveStoredStoreContext } from "./db.server";
import { getPlanConfig } from "./plans";
import { getShopifyStoreInfo } from "./shopify-data.server";

const STORE_CONTEXT_REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // refresh once per day

// Cache authenticate.admin per request so parent + child loaders don't double-exchange the token.
const _authCache = new WeakMap();

/**
 * Fire-and-forget: refresh the cached store context if it's missing or older than the TTL.
 * Uses the Shopify admin client already obtained by getShopWithPlan so no extra auth is needed.
 * Errors are swallowed so a context-refresh failure never breaks a page load.
 */
async function maybeRefreshStoreContext(shop, shopDomain) {
  if (!shop?.id || !shopDomain) return;
  try {
    // Check whether the cached value is still fresh (re-use the TTL-aware getter)
    const cached = await getStoredStoreContext(shop.id, STORE_CONTEXT_REFRESH_TTL_MS);
    if (cached) return; // fresh — nothing to do
    const storeInfo = await getShopifyStoreInfo(shopDomain);
    if (storeInfo) {
      await saveStoredStoreContext(shop.id, storeInfo);
      console.log(`[loader-helpers] Store context refreshed for ${shopDomain}`);
    }
  } catch (err) {
    console.warn(`[loader-helpers] Background store context refresh failed for ${shopDomain}:`, err?.message);
  }
}

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
  let session, admin;
  if (_authCache.has(request)) {
    ({ session, admin } = _authCache.get(request));
  } else {
    ({ session, admin } = await authenticate.admin(request));
    _authCache.set(request, { session, admin });
  }
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

  // Keep store context fresh so DM automation can answer store_question DMs without
  // a live Shopify API call at webhook time. Fire-and-forget: never blocks the page load.
  maybeRefreshStoreContext(shop, shopDomain).catch(() => {});

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

