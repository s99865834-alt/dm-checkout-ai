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
import {
  DISCOUNT_BUFFER_SIZE,
  DISCOUNT_TOPUP_BATCH,
  POOL_REAP_AFTER_DAYS,
  POOL_REAP_GRACE_DAYS,
  codesNeeded,
  generateDiscountCode,
  toVariantKey,
} from "./discount-rules";
import { addDiscountCodes, createVariantDiscount, deleteDiscount } from "./discounts.server";

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
 * @returns {Promise<{code: string, type: string, value: number, currency: string}|null>}
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

  if (data?.code) {
    return { code: data.code, type: data.type, value: Number(data.value), currency: data.currency };
  }
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
    discountType: data.type,
    discountValue: Number(data.value),
    currency: data.currency,
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
async function mintCodeNow({
  shopId,
  shopDomain,
  variantKey,
  linkId,
  discountType,
  discountValue,
  currency,
  productTitle,
}) {
  const work = (async () => {
    const code = generateDiscountCode();
    const created = await createVariantDiscount({
      shopDomain,
      variantId: variantKey,
      discountType,
      discountValue,
      currency,
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
        discount_type: discountType,
        discount_value: discountValue,
        discount_node_id: created.discountNodeId,
      })
      .select("id")
      .single();

    // Two replies for the same new variant can race here. The unique index on
    // (shop_id, variant_id, discount_type, discount_value) means one loses; it drops its
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

    return { code: created.code, type: discountType, value: discountValue, currency };
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

/**
 * Bring every pool that has dropped below the buffer back up to it.
 *
 * Bounded by an RPC rather than a select, because PostgREST truncates at 1000
 * rows without saying so and a half-read queue would look like a healthy
 * short one.
 */
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

    const requested = Array.from({ length: need }, () => generateDiscountCode());
    // Only codes Shopify confirms get recorded. An unconfirmed code in a
    // checkout link breaks the link rather than quietly omitting a discount.
    const confirmed = await addDiscountCodes(pool.shopify_domain, pool.discount_node_id, requested);
    if (!confirmed.length) continue;

    const rows = confirmed.map((code) => ({
      shop_id: pool.shop_id,
      pool_id: pool.pool_id,
      code,
    }));
    const { error: insertError } = await supabase.from("discount_codes").insert(rows);
    if (insertError) {
      console.error(`[discount-pool] Code insert failed for ${pool.pool_id}: ${insertError.message}`);
      continue;
    }
    minted += confirmed.length;
  }
  return minted;
}

/**
 * Delete discounts that should no longer exist.
 *
 * Covers all three reasons in one bounded query: the variant has gone quiet,
 * the shop stopped being eligible (downgraded, left the rollout, switched the
 * setting off), or the merchant changed the rate so the pool would hand out
 * the old one. The eligibility part matters most: without it a shop that
 * stops paying keeps handing out live codes from the pool it filled while it
 * was on Growth.
 *
 * A recently used pool is left alone whatever the reason, because deleting a
 * discount also kills the codes already sitting in customers' DMs. Stale
 * pools hand nothing new out in the meantime: the claim re-checks eligibility
 * and the current rate every time.
 */
async function reapPools() {
  const { data, error } = await supabase.rpc("discount_pools_to_reap", {
    p_days: POOL_REAP_AFTER_DAYS,
    p_limit: 200,
    p_grace_days: POOL_REAP_GRACE_DAYS,
  });
  if (error) {
    console.error(`[discount-pool] Reap lookup failed: ${error.message}`);
    return 0;
  }

  let reaped = 0;
  for (const pool of data || []) {
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

// setInterval does not wait for the previous run, and a pass that talks to
// Shopify once per pool can outlast its own interval once there are enough
// shops. Two overlapping passes would both see the same thin pools and mint
// two batches for each.
let maintenanceRunning = false;

/**
 * One maintenance pass: top up thin pools, reap dead ones.
 *
 * Deliberately does not create pools. The reply path mints the first code for
 * a variant itself, so pre-creating from links_sent would duplicate that work
 * while adding a per-shop scan and a burst of Shopify calls that grows with
 * the number of merchants.
 */
export async function runDiscountPoolMaintenance() {
  if (maintenanceRunning) {
    logger.debug("[discount-pool] Maintenance already running; skipping this tick");
    return { skipped: true, minted: 0, reaped: 0 };
  }
  maintenanceRunning = true;
  try {
    const minted = await topUpPools();
    const reaped = await reapPools();
    logger.debug(`[discount-pool] Maintenance done: ${minted} codes minted, ${reaped} pools reaped`);
    return { skipped: false, minted, reaped };
  } finally {
    maintenanceRunning = false;
  }
}
