/**
 * Store context for automated replies, with a background refresh.
 *
 * The cache behind `shops.store_context_json` is written by the app's page
 * loaders, so it only refreshes when a merchant opens the app in their Shopify
 * admin. For a merchant whose automation just runs in the background, that can
 * be never: on 2 Sep 2026 Mark Watts Studios was answering store questions
 * from a snapshot taken 34 days earlier, and Love By Luna from one 17 days
 * old, because neither had opened the app since. Shipping, returns and contact
 * details were being quoted confidently from a July copy.
 *
 * Replies still use the cached value straight away. Blocking a customer on an
 * Admin API round trip is worse than a slightly old policy, and the cache is
 * usually right. But a stale read now also starts a refresh, so the staleness
 * is bounded by how often the store gets a message rather than by how often
 * the merchant logs in.
 */

import { getStoredStoreContextWithAge, saveStoredStoreContext } from "./db.server";
import { getShopifyStoreInfo } from "./shopify-data.server";
import logger from "./logger.server";

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

// How often we're willing to even *look* at the age. ensureStoreContextFresh
// runs on every inbound message, so without this a busy store would spend a
// Supabase read per message asking a question whose answer changes once a day.
const CHECK_THROTTLE_MS = 60 * 60 * 1000;

// Shops with a refresh in flight. A viral post can deliver dozens of webhooks
// a minute, and without this each one would start its own Admin API call.
const refreshing = new Set();

// Shop id -> when we last checked the age, for the throttle above.
const lastChecked = new Map();

/**
 * The store context to answer with, refreshing in the background when stale.
 *
 * @param {{id: string, shopify_domain?: string}} shop
 * @returns {Promise<Object|null>} the cached context, however old, or null
 */
export async function getStoreContextForReply(shop) {
  if (!shop?.id) return null;

  const { context, stale } = await getStoredStoreContextWithAge(shop.id, REFRESH_AFTER_MS);

  // No cache at all is also worth a refresh. Callers keep their own live
  // fallback for answering the message in hand.
  if (stale || !context) startRefresh(shop);

  return context;
}

/**
 * Keep the cache warm from ordinary traffic, without the caller waiting.
 *
 * getStoreContextForReply only runs when a customer asks about the store, so
 * on its own it never reached the stores that were most out of date: Mark
 * Watts sat on a 34-day-old snapshot through a whole day of comment replies,
 * because none of them was a store question. This runs on every inbound
 * message instead.
 *
 * It costs the reply nothing. Nothing is awaited, so no reply waits on it, and
 * the throttle means the age check itself is one Supabase read per shop per
 * hour rather than one per message.
 *
 * @param {{id: string, shopify_domain?: string}} shop
 */
export function ensureStoreContextFresh(shop) {
  if (!shop?.id || !shop.shopify_domain) return;

  const last = lastChecked.get(shop.id) || 0;
  if (Date.now() - last < CHECK_THROTTLE_MS) return;
  lastChecked.set(shop.id, Date.now());

  (async () => {
    try {
      const { context, stale } = await getStoredStoreContextWithAge(shop.id, REFRESH_AFTER_MS);
      if (stale || !context) startRefresh(shop);
    } catch (err) {
      logger.debug(`[store-context] Freshness check failed for ${shop.shopify_domain}: ${err?.message || err}`);
    }
  })();
}

function startRefresh(shop) {
  if (!shop?.id || !shop.shopify_domain) return;
  if (refreshing.has(shop.id)) return;
  refreshing.add(shop.id);

  // Deliberately not awaited: the reply in flight answers from the cache.
  // Railway runs a long-lived process, so this finishes after the response.
  (async () => {
    try {
      const storeInfo = await getShopifyStoreInfo(shop.shopify_domain);
      if (storeInfo) {
        await saveStoredStoreContext(shop.id, storeInfo);
        logger.debug(`[store-context] Refreshed cache for ${shop.shopify_domain}`);
      } else {
        logger.debug(
          `[store-context] Refresh for ${shop.shopify_domain} returned nothing; keeping the old cache`
        );
      }
    } catch (err) {
      // Never throw from here: an unhandled rejection would take down the
      // worker over a cache refresh the reply didn't depend on.
      logger.warn(
        `[store-context] Refresh failed for ${shop.shopify_domain}: ${err?.message || err}`
      );
    } finally {
      refreshing.delete(shop.id);
    }
  })();
}

/** Test seam: forget any in-flight refresh state and the throttle. */
export function resetStoreContextRefreshState() {
  refreshing.clear();
  lastChecked.clear();
}
