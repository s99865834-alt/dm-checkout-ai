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
  percentage,
  productTitle,
  firstCode,
}) {
  const admin = await adminFor(shopDomain);
  if (!admin) return null;
  if (!variantId || !firstCode || !percentage) return null;

  const variables = {
    basicCodeDiscount: {
      title: discountTitle(percentage, productTitle),
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
        // DiscountPercentage is a fraction, so 10% is 0.1.
        value: { percentage: percentage / 100 },
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
 * Attach more codes to an existing discount.
 *
 * Asynchronous on Shopify's side: this returns as soon as the bulk creation is
 * queued, so a caller cannot assume the codes exist yet. That is the reason
 * the pool keeps a buffer instead of minting on demand, and the reason nothing
 * on the reply path ever waits for this.
 *
 * @returns {Promise<boolean>} whether the batch was accepted
 */
export async function addDiscountCodes(shopDomain, discountNodeId, codes) {
  const admin = await adminFor(shopDomain);
  if (!admin) return false;
  if (!discountNodeId || !Array.isArray(codes) || codes.length === 0) return false;

  try {
    const response = await admin.graphql(ADD_CODES, {
      variables: { discountId: discountNodeId, codes: codes.map((code) => ({ code })) },
    });
    const body = await response.json();
    const error = firstUserError(body, "discountRedeemCodeBulkAdd");
    if (error) {
      console.error(`[discounts] Bulk add failed for ${shopDomain}: ${error}`);
      return false;
    }
    return !!body?.data?.discountRedeemCodeBulkAdd?.bulkCreation?.id;
  } catch (err) {
    console.error(`[discounts] Bulk add threw for ${shopDomain}: ${err?.message || err}`);
    return false;
  }
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
