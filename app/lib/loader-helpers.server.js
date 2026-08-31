import { authenticate } from "../shopify.server";
import { getShopByDomain, createOrUpdateShop, ensureUsageMonthCurrent, getStoredStoreContext, saveStoredStoreContext } from "./db.server";
import { getPlanConfig } from "./plans";
import { effectivePlan } from "./entitlements";
import { getShopifyStoreInfo } from "./shopify-data.server";
import { cached } from "./loader-cache.server";
import logger from "./logger.server";

const STORE_CONTEXT_REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // refresh once per day

// Shop rows are read by every loader of every navigation (parent layout and
// child page both call getShopWithPlan) but only change through explicit
// writes — all of which invalidate the "shopplan:" prefix (createOrUpdateShop,
// updateShopPlan, markShopUninstalled in db.server.js). A short TTL turns
// those repeated Supabase round trips into memory reads.
const SHOP_CACHE_TTL_MS = 30 * 1000;

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
      logger.debug(`[loader-helpers] Store context refreshed for ${shopDomain}`);
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

  let shop;
  try {
    shop = await cached(`shopplan:${shopDomain}`, SHOP_CACHE_TTL_MS, async () => {
      let s = await getShopByDomain(shopDomain);

      if (!s) {
        // Creation failures throw out of cached() so a miss is never stored.
        s = await createOrUpdateShop(shopDomain, {
          plan: "FREE",
          monthly_cap: 100,
          active: true,
        });
        logger.debug(`[getShopWithPlan] Created shop ${shopDomain} (fallback)`);
      } else if (!s.active) {
        // Reinstall / reactivation path. Always reset to FREE so that the merchant
        // must explicitly re-approve a paid charge via the Billing API before
        // regaining any paid-plan features — required by Shopify App Store rules.
        try {
          s = await createOrUpdateShop(shopDomain, {
            plan: "FREE",
            monthly_cap: 100,
            active: true,
            usage_count: 0,
          });
          logger.debug(`[getShopWithPlan] Reactivated shop ${shopDomain} on FREE (fallback)`);
        } catch (error) {
          console.error(`[getShopWithPlan] Error reactivating shop ${shopDomain}:`, error);
        }
      }

      return ensureUsageMonthCurrent(s);
    });
  } catch (error) {
    console.error(`[getShopWithPlan] Error resolving shop ${shopDomain}:`, error);
    return { shop: null, plan: getPlanConfig("FREE"), session, admin };
  }

  const isBetaActive = shop.beta_trial_expires_at &&
    new Date(shop.beta_trial_expires_at) > new Date();
  const plan = effectivePlan(
    isBetaActive ? getPlanConfig("PRO") : getPlanConfig(shop.plan),
    shop
  );

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

