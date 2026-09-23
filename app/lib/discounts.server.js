/**
 * Shopify side of single-use checkout discounts.
 *
 * Every mutation here was validated against the 2026-07 Admin schema with the
 * Shopify dev MCP before being written.
 *
 * Nothing in this file is on the reply path. Replies only ever read a
 * pre-minted code out of Postgres (see discount-pool.server.js); the calls
 * below run from the maintenance cron or from a merchant toggling the setting.
 */

import { unauthenticated } from "../shopify.server";
import logger from "./logger.server";
import { discountTitle } from "./discount-rules";

const CREATE_DISCOUNT = `
  mutation CreateVariantDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message code }
    }
  }
`;

const ADD_CODES = `
  mutation AddDiscountCodes($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
    discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
      bulkCreation { id }
      userErrors { field message code }
    }
  }
`;

const BULK_CODE_STATUS = `
  query BulkCodeStatus($id: ID!) {
    discountRedeemCodeBulkCreation(id: $id) {
      done
      importedCount
      failedCount
      codes(first: 250) {
        nodes {
          discountRedeemCode { code }
          errors { message }
        }
      }
    }
  }
`;

// Off the reply path, so waiting is cheap. Bulk adds of a handful of codes
// normally finish well inside the first poll.
const BULK_POLL_ATTEMPTS = 6;
const BULK_POLL_DELAY_MS = 800;

const DELETE_DISCOUNT = `
  mutation DeleteDiscount($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors { field message code }
    }
  }
`;

async function adminFor(shopDomain) {
  if (!shopDomain) return null;
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    return admin;
  } catch (error) {
    logger.debug(`[discounts] No admin client for ${shopDomain}: ${error?.message || error}`);
    return null;
  }
}

const VARIANT_PRICE = `
  query VariantPrice($id: ID!) {
    productVariant(id: $id) { price }
  }
`;

/** The variant's current price, or null if it can't be read. */
async function variantPrice(admin, variantId) {
  try {
    const response = await admin.graphql(VARIANT_PRICE, { variables: { id: variantId } });
    const body = await response.json();
    const raw = body?.data?.productVariant?.price;
    const price = raw == null ? NaN : Number(raw);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch (err) {
    console.error(`[discounts] Variant price lookup failed for ${variantId}: ${err?.message || err}`);
    return null;
  }
}

function firstUserError(payload, key) {
  const errors = payload?.data?.[key]?.userErrors || [];
  return errors.length ? errors.map((e) => e.message).join("; ") : null;
}

/**
 * Create a discount scoped to one variant, and mint its first code.
 *
 * usageLimit is 1 and Shopify applies that per redeem code rather than across
 * the discount, which is what makes every code in the pool single use. A
 * merchant setting this up by hand would very reasonably put the number of
 * customers here instead and silently break that for every code we later add,
 * which is why the app owns the discount rather than pointing at one of theirs.
 *
 * The scope is the variant, not the cart: a customer arriving with other items
 * already in their cart, or adding more after clicking, gets the discount on
 * the linked item only.
 *
 * @returns {Promise<{discountNodeId: string, code: string}|null>}
 */
export async function createVariantDiscount({
  shopDomain,
  variantId,
  discountType,
  discountValue,
  currency,
  productTitle,
  firstCode,
}) {
  const admin = await adminFor(shopDomain);
  if (!admin) return null;
  if (!variantId || !firstCode || !discountValue) return null;

  // Everything is created as a fixed amount off one line, so the customer is
  // discounted on a single unit no matter how many they end up buying.
  //
  // A percentage is resolved to cash here rather than sent as a percentage.
  // Shopify's `percentage` applies to every matching unit in the cart, and
  // the obvious cap, discountOnQuantity, is rejected on a basic code discount
  // ("discountOnQuantity field is only permitted with bxgy discounts",
  // verified against a live store). Converting at mint time is the only way
  // to honour what the merchant agreed to when they typed a rate.
  //
  // The trade is that the cash value is fixed when the code is minted, so a
  // price change afterwards leaves outstanding codes on the old figure.
  // Pools hold five codes and get reaped, so the window is small.
  let amount = discountValue;
  if (discountType === "percentage") {
    const price = await variantPrice(admin, variantId);
    if (price == null) {
      // Falling back to a raw percentage here would quietly discount every
      // unit, which is the behaviour this exists to prevent. No discount is
      // the safer miss.
      console.error(`[discounts] No price for ${variantId} on ${shopDomain}; skipping discount`);
      return null;
    }
    amount = Math.round(price * discountValue) / 100;
    if (!(amount > 0)) return null;
  }

  const value = { discountAmount: { amount, appliesOnEachItem: false } };

  const variables = {
    basicCodeDiscount: {
      title: discountTitle(discountType, discountValue, currency, productTitle),
      code: firstCode,
      // Backdated a minute. The code goes into a link that can be clicked
      // seconds later, and "starts now" leaves a window where Shopify has the
      // discount but has not started honouring it yet, which surfaces to the
      // customer as a dead checkout link rather than as a missing discount.
      startsAt: new Date(Date.now() - 60 * 1000).toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      // Deprecated in favour of `context`, which currently models markets
      // rather than customer eligibility. Still the documented way to say
      // "anyone with the code".
      customerSelection: { all: true },
      customerGets: {
        value,
        items: { products: { productVariantsToAdd: [variantId] } },
      },
      // Stack with order-level and shipping promotions, but not with another
      // product discount on the same line. Without this the code can silently
      // fail to apply during a merchant's sale, so the reply promises a
      // discount the customer never sees at checkout.
      combinesWith: {
        orderDiscounts: true,
        shippingDiscounts: true,
        productDiscounts: false,
      },
    },
  };

  try {
    const response = await admin.graphql(CREATE_DISCOUNT, { variables });
    const body = await response.json();
    const error = firstUserError(body, "discountCodeBasicCreate");
    if (error) {
      console.error(`[discounts] Create failed for ${shopDomain} ${variantId}: ${error}`);
      return null;
    }
    const discountNodeId = body?.data?.discountCodeBasicCreate?.codeDiscountNode?.id || null;
    if (!discountNodeId) return null;
    return { discountNodeId, code: firstCode };
  } catch (err) {
    console.error(`[discounts] Create threw for ${shopDomain} ${variantId}: ${err?.message || err}`);
    return null;
  }
}

/**
 * Attach more codes to an existing discount, and wait for Shopify to confirm
 * which ones actually landed.
 *
 * The bulk add is queued rather than applied, so the mutation returning
 * cleanly does not mean the codes exist. Recording an unconfirmed code is not
 * a harmless optimism: the code goes into a checkout link, and a code Shopify
 * never created makes that link fail rather than merely arrive without a
 * discount. Polling is free here because this only runs from the maintenance
 * pass, never from a reply.
 *
 * Codes that don't get confirmed in time are simply not recorded. They may
 * still exist at Shopify, unused and unreachable, and go away when the pool
 * is eventually reaped.
 *
 * @returns {Promise<string[]>} the codes Shopify confirmed
 */
export async function addDiscountCodes(shopDomain, discountNodeId, codes) {
  const admin = await adminFor(shopDomain);
  if (!admin) return [];
  if (!discountNodeId || !Array.isArray(codes) || codes.length === 0) return [];

  let bulkId = null;
  try {
    const response = await admin.graphql(ADD_CODES, {
      variables: { discountId: discountNodeId, codes: codes.map((code) => ({ code })) },
    });
    const body = await response.json();
    const error = firstUserError(body, "discountRedeemCodeBulkAdd");
    if (error) {
      console.error(`[discounts] Bulk add failed for ${shopDomain}: ${error}`);
      return [];
    }
    bulkId = body?.data?.discountRedeemCodeBulkAdd?.bulkCreation?.id || null;
  } catch (err) {
    console.error(`[discounts] Bulk add threw for ${shopDomain}: ${err?.message || err}`);
    return [];
  }
  if (!bulkId) return [];

  for (let attempt = 0; attempt < BULK_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, BULK_POLL_DELAY_MS));
    try {
      const response = await admin.graphql(BULK_CODE_STATUS, { variables: { id: bulkId } });
      const body = await response.json();
      const creation = body?.data?.discountRedeemCodeBulkCreation;
      if (!creation?.done) continue;

      const confirmed = (creation.codes?.nodes || [])
        .filter((node) => !(node?.errors || []).length && node?.discountRedeemCode?.code)
        .map((node) => node.discountRedeemCode.code);

      if (creation.failedCount > 0) {
        console.warn(
          `[discounts] ${creation.failedCount} of ${codes.length} codes failed for ${shopDomain}`,
        );
      }
      return confirmed;
    } catch (err) {
      console.error(`[discounts] Bulk poll threw for ${shopDomain}: ${err?.message || err}`);
      return [];
    }
  }

  console.warn(`[discounts] Bulk add for ${shopDomain} did not confirm in time; not recording`);
  return [];
}

/**
 * Delete a discount and, with it, every code under it.
 *
 * Deletion is the only thing that frees capacity against the store-wide
 * ceiling of 20,000,000 redeem codes, which is shared with every other app the
 * merchant runs. Leaving spent discounts behind would quietly consume a budget
 * that isn't ours.
 */
export async function deleteDiscount(shopDomain, discountNodeId) {
  const admin = await adminFor(shopDomain);
  if (!admin) return false;
  if (!discountNodeId) return false;

  try {
    const response = await admin.graphql(DELETE_DISCOUNT, {
      variables: { id: discountNodeId },
    });
    const body = await response.json();
    const error = firstUserError(body, "discountCodeDelete");
    if (error) {
      console.error(`[discounts] Delete failed for ${shopDomain} ${discountNodeId}: ${error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[discounts] Delete threw for ${shopDomain}: ${err?.message || err}`);
    return false;
  }
}
