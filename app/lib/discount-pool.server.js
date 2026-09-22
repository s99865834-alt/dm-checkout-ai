/**
 * Pools of pre-minted single-use discount codes, one pool per variant.
 *
 * The reply path only ever calls claimDiscountCode, which is a single indexed
 * Postgres function and never touches Shopify. Everything that talks to
 * Shopify (creating a discount, minting more codes, deleting stale ones) runs
 * from the maintenance job in cron.discount-pools.jsx.
 *
 * That split exists because Instagram allows exactly one private reply per
 * comment. On one live account a competing tool already wins that race about
 * once a week, so adding a Shopify round trip to the reply path would cost
 * real replies, not just milliseconds.
 */

import supabase from "./supabase.server";
import logger from "./logger.server";
import { getPlanConfig } from "./plans";
import { effectivePlan } from "./entitlements";
import { warnIfTruncated } from "./row-cap";
import {
  DISCOUNT_BUFFER_SIZE,
  DISCOUNT_TOPUP_BATCH,
  POOL_REAP_AFTER_DAYS,
  codesNeeded,
  generateDiscountCode,
  isValidDiscountPercentage,
  toVariantKey,
} from "./discount-rules";
import { addDiscountCodes, createVariantDiscount, deleteDiscount } from "./discounts.server";

/** How far back to look for variants that should have a pool. */
const WARM_LOOKBACK_DAYS = 14;

/**
 * Budget for minting a discount inline on the reply path.
 *
 * Generous relative to a Shopify mutation and small relative to the reply it
 * sits in, which already makes several model and Shopify calls. Past this the
 * reply ships without a discount.
 */
const MINT_TIMEOUT_MS = 2500;

/**
 * Take one unused code for this variant and bind it to the link.
 *
 * Returns null for every "not today" case: feature off, no pool yet, pool
 * empty, database unhappy. The caller sends its reply either way, so a null
 * costs one customer a discount rather than costing the merchant a reply.
 *
 * @returns {Promise<{code: string, percentage: number}|null>}
 */
export async function claimDiscountCode({ shopId, shopDomain, variantId, linkId, productTitle }) {
  const key = toVariantKey(variantId);
  if (!shopId || !key || !linkId) return null;

  let data;
  try {
    const result = await supabase.rpc("claim_discount_code", {
      p_shop_id: shopId,
      p_variant_id: key,
      p_link_id: linkId,
    });
    if (result.error) {
      logger.debug(`[discount-pool] Claim failed for ${key}: ${result.error.message}`);
      return null;
    }
    data = result.data;
  } catch (err) {
    logger.debug(`[discount-pool] Claim threw for ${key}: ${err?.message || err}`);
    return null;
  }

  if (data?.code) return { code: data.code, percentage: data.percentage };
  if (!data?.needs_mint || !shopDomain) return null;

  // First link to this variant, so there is nothing pooled yet. Minting here
  // rather than waiting for the maintenance pass is the difference between the
  // merchant turning the setting on and it working, and the merchant turning
  // it on and watching the next few replies go out without a discount. The
  // resolved product moves around on stores with unmapped posts, so "first
  // link to this variant" keeps happening rather than being a one-off.
  return mintCodeNow({
    shopId,
    shopDomain,
    variantKey: key,
    linkId,
    percentage: data.percentage,
    productTitle,
  });
}

/**
 * Create the discount for a variant and reserve its first code, inline.
 *
 * Bounded by a timeout because this is the one piece of the feature that
 * touches Shopify from the reply path. Past the budget the reply goes out
 * with no discount rather than late: Instagram allows a single private reply
 * per comment and other tools are racing for it, so a missed discount is
 * cheap and a missed reply is not. The abandoned request still completes at
 * Shopify, and the pool it creates gets picked up on the next pass.
 */
async function mintCodeNow({ shopId, shopDomain, variantKey, linkId, percentage, productTitle }) {
  const work = (async () => {
    const code = generateDiscountCode();
    const created = await createVariantDiscount({
      shopDomain,
      variantId: variantKey,
      percentage,
      productTitle,
      firstCode: code,
    });
    if (!created) return null;

    const { data: pool, error: poolError } = await supabase
      .from("discount_pools")
      .insert({
        shop_id: shopId,
        variant_id: variantKey,
        product_title: productTitle || null,
        percentage,
        discount_node_id: created.discountNodeId,
      })
      .select("id")
      .single();

    // Two replies for the same new variant can race here. The unique index on
    // (shop_id, variant_id, percentage) means one loses; it drops its
    // just-created Shopify discount rather than leaving an orphan the reaper
    // would never find. The rate is part of that key on purpose: a merchant
    // changing 20% to 5% leaves the old pool in place until it is reaped, and
    // keying on the variant alone made the new pool collide with it, which
    // killed discounts for every product that had ever been linked.
    if (poolError || !pool) {
      await deleteDiscount(shopDomain, created.discountNodeId).catch(() => {});
      logger.debug(`[discount-pool] Lost the mint race for ${variantKey}`);
      return null;
    }

    const { error: codeError } = await supabase.from("discount_codes").insert({
      shop_id: shopId,
      pool_id: pool.id,
      code: created.code,
      link_id: linkId,
      claimed_at: new Date().toISOString(),
    });
    if (codeError) {
      logger.debug(`[discount-pool] Code insert failed for ${variantKey}: ${codeError.message}`);
      return null;
    }

    return { code: created.code, percentage };
  })();

  try {
    return await Promise.race([
      work.catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), MINT_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/**
 * Which link a redeemed code belongs to, for order attribution.
 *
 * This is the reason the codes are worth the machinery: Shopify puts the code
 * on the order, so a purchase can be tied to the exact reply that caused it
 * even when the customer buys days later on another device, which neither the
 * ref param nor the cart attribute survives.
 *
 * @param {string} shopId
 * @param {string[]} codes - codes seen on the order
 * @returns {Promise<string|null>} link_id
 */
export async function findLinkIdForDiscountCodes(shopId, codes) {
  if (!shopId || !Array.isArray(codes) || codes.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from("discount_codes")
      .select("link_id")
      .eq("shop_id", shopId)
      .in("code", codes)
      .not("link_id", "is", null)
      .limit(1);
    if (error) {
      console.error(`[discount-pool] Code lookup failed: ${error.message}`);
      return null;
    }
    return data?.[0]?.link_id || null;
  } catch (err) {
    console.error(`[discount-pool] Code lookup threw: ${err?.message || err}`);
    return null;
  }
}

/** Shops whose plan, rollout flag and settings all say discounts are on. */
async function eligibleShops() {
  const { data, error } = await supabase
    .from("shops")
    .select("id, shopify_domain, plan, beta_trial_expires_at, comment_trial_started_at, discounts_rollout_enabled, settings(discount_enabled, discount_percentage)")
    .eq("active", true)
    .eq("discounts_rollout_enabled", true)
    .limit(500);

  if (error) {
    console.error(`[discount-pool] Eligible shop lookup failed: ${error.message}`);
    return [];
  }
  warnIfTruncated("discount-pool eligible shops", data, logger);

  return (data || [])
    .map((shop) => {
      const settings = Array.isArray(shop.settings) ? shop.settings[0] : shop.settings;
      const percentage = settings?.discount_percentage;
      if (!settings?.discount_enabled || !isValidDiscountPercentage(percentage)) return null;

      const betaActive =
        shop.beta_trial_expires_at && new Date(shop.beta_trial_expires_at) > new Date();
      const plan = effectivePlan(
        betaActive ? getPlanConfig("PRO") : getPlanConfig(shop.plan),
        shop,
      );
      if (!plan.discounts) return null;

      return { id: shop.id, shopify_domain: shop.shopify_domain, percentage };
    })
    .filter(Boolean);
}

/**
 * Create pools for variants this shop has linked recently but has no pool for.
 *
 * Pools cannot be created at reply time without putting a Shopify call on the
 * critical path, so the first link to a new variant simply goes out without a
 * discount and this fills the gap before the next one. Working from
 * links_sent means the warm-up and the steady state are the same code path.
 */
async function ensurePoolsForShop(shop) {
  const since = new Date(Date.now() - WARM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: links, error } = await supabase
    .from("links_sent")
    .select("product_id, variant_id")
    .eq("shop_id", shop.id)
    .gte("sent_at", since)
    .not("variant_id", "is", null)
    .limit(500);

  if (error) {
    console.error(`[discount-pool] Link lookup failed for ${shop.shopify_domain}: ${error.message}`);
    return 0;
  }
  warnIfTruncated(`discount-pool links for ${shop.shopify_domain}`, links, logger);

  const wanted = new Map();
  for (const row of links || []) {
    const key = toVariantKey(row.variant_id);
    if (key) wanted.set(key, row.product_id || null);
  }
  if (wanted.size === 0) return 0;

  const { data: existing } = await supabase
    .from("discount_pools")
    .select("variant_id, percentage")
    .eq("shop_id", shop.id)
    .in("variant_id", [...wanted.keys()]);

  // A pool minted at a percentage the merchant has since changed would hand
  // out the old rate, so treat it as missing and let the reaper remove it.
  const usable = new Set(
    (existing || []).filter((p) => p.percentage === shop.percentage).map((p) => p.variant_id),
  );

  let created = 0;
  for (const [variantId, productId] of wanted) {
    if (usable.has(variantId)) continue;

    const code = generateDiscountCode();
    const result = await createVariantDiscount({
      shopDomain: shop.shopify_domain,
      variantId,
      percentage: shop.percentage,
      productTitle: null,
      firstCode: code,
    });
    if (!result) continue;

    const { data: pool, error: poolError } = await supabase
      .from("discount_pools")
      .insert({
        shop_id: shop.id,
        variant_id: variantId,
        product_id: productId,
        percentage: shop.percentage,
        discount_node_id: result.discountNodeId,
      })
      .select("id")
      .single();

    if (poolError || !pool) {
      console.error(`[discount-pool] Pool insert failed for ${variantId}: ${poolError?.message}`);
      continue;
    }

    await supabase.from("discount_codes").insert({
      shop_id: shop.id,
      pool_id: pool.id,
      code: result.code,
    });
    created += 1;
  }
  return created;
}

/** Bring every pool that has dropped below the buffer back up to it. */
async function topUpPools() {
  const { data, error } = await supabase.rpc("discount_pools_needing_topup", {
    p_buffer: DISCOUNT_BUFFER_SIZE,
    p_limit: 200,
  });
  if (error) {
    console.error(`[discount-pool] Top-up lookup failed: ${error.message}`);
    return 0;
  }

  let minted = 0;
  for (const pool of data || []) {
    const need = Math.min(codesNeeded(pool.available), DISCOUNT_TOPUP_BATCH);
    if (need <= 0) continue;

    const codes = Array.from({ length: need }, () => generateDiscountCode());
    const accepted = await addDiscountCodes(pool.shopify_domain, pool.discount_node_id, codes);
    if (!accepted) continue;

    // Shopify queues the bulk add, so the codes may not be live the instant
    // this returns. Recording them now is still right: a code that failed to
    // land just fails at checkout for one customer, whereas not recording
    // them would mint the same batch again on every pass.
    const rows = codes.map((code) => ({ shop_id: pool.shop_id, pool_id: pool.pool_id, code }));
    const { error: insertError } = await supabase.from("discount_codes").insert(rows);
    if (insertError) {
      console.error(`[discount-pool] Code insert failed for ${pool.pool_id}: ${insertError.message}`);
      continue;
    }
    minted += need;
  }
  return minted;
}

/**
 * Pools that should no longer exist at all: the shop downgraded off Growth,
 * turned the setting off, left the rollout, or changed the percentage so every
 * code under the old pool would hand out the wrong rate.
 *
 * Without this a shop that stops paying keeps handing out live discount codes
 * from the pool it filled while it was eligible.
 */
async function findOrphanedPools(eligible) {
  const byShop = new Map(eligible.map((s) => [s.id, s]));

  const { data, error } = await supabase
    .from("discount_pools")
    .select("id, shop_id, percentage, discount_node_id, shops(shopify_domain)")
    .limit(1000);

  if (error) {
    console.error(`[discount-pool] Orphan lookup failed: ${error.message}`);
    return [];
  }
  warnIfTruncated("discount-pool orphan scan", data, logger);

  return (data || [])
    .filter((pool) => {
      const shop = byShop.get(pool.shop_id);
      return !shop || shop.percentage !== pool.percentage;
    })
    .map((pool) => ({
      pool_id: pool.id,
      shopify_domain: Array.isArray(pool.shops)
        ? pool.shops[0]?.shopify_domain
        : pool.shops?.shopify_domain,
      discount_node_id: pool.discount_node_id,
    }));
}

/** Delete discounts for variants nobody has linked in a long time. */
async function reapPools(eligible) {
  const { data, error } = await supabase.rpc("discount_pools_to_reap", {
    p_days: POOL_REAP_AFTER_DAYS,
    p_limit: 200,
  });
  if (error) {
    console.error(`[discount-pool] Reap lookup failed: ${error.message}`);
    return 0;
  }

  const orphaned = await findOrphanedPools(eligible);
  const seen = new Set();
  const all = [...(data || []), ...orphaned].filter((pool) => {
    if (!pool?.pool_id || seen.has(pool.pool_id)) return false;
    seen.add(pool.pool_id);
    return true;
  });

  let reaped = 0;
  for (const pool of all) {
    const deleted = await deleteDiscount(pool.shopify_domain, pool.discount_node_id);
    // Only drop our rows once Shopify has actually let go of the discount,
    // otherwise the node id is lost and the discount lives in the merchant's
    // admin forever with nothing pointing at it.
    if (!deleted) continue;
    const { error: deleteError } = await supabase
      .from("discount_pools")
      .delete()
      .eq("id", pool.pool_id);
    if (deleteError) {
      console.error(`[discount-pool] Pool delete failed for ${pool.pool_id}: ${deleteError.message}`);
      continue;
    }
    reaped += 1;
  }
  return reaped;
}

/**
 * One maintenance pass: create missing pools, top up thin ones, reap dead ones.
 * Called from the cron route; never from a request handler.
 */
export async function runDiscountPoolMaintenance() {
  const shops = await eligibleShops();
  let created = 0;
  for (const shop of shops) {
    created += await ensurePoolsForShop(shop);
  }
  const minted = await topUpPools();
  const reaped = await reapPools(shops);

  logger.debug(
    `[discount-pool] Maintenance done: ${shops.length} shops, ${created} pools created, ${minted} codes minted, ${reaped} pools reaped`,
  );
  return { shops: shops.length, created, minted, reaped };
}
