// Billing helpers for a Managed Pricing app. We do NOT call appSubscriptionCreate
// — Managed Pricing apps use Shopify's hosted pricing page for plan selection
// and approval. We only query for the active subscription (to sync shop.plan)
// and cancel on FREE downgrade (which is permitted under Managed Pricing).

import { updateShopPlan } from "./db.server";

/**
 * Get the current active subscription for a shop
 * @param {Object} admin - Authenticated Shopify admin API client
 * @returns {Promise<Object|null>}
 */
export async function getCurrentSubscription(admin) {
  // Note: lineItems.plan is of type AppPlanV2 (not a union), so the
  // AppRecurringPricing / AppUsagePricing fragments must be spread on
  // plan.pricingDetails (AppPricingDetails union), not on plan directly.
  const query = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          currentPeriodEnd
          test
          lineItems {
            id
            plan {
              pricingDetails {
                __typename
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
                ... on AppUsagePricing {
                  terms
                  cappedAmount {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const responseJson = await response.json();

  if (responseJson.errors?.length) {
    throw new Error(
      `Billing API errors: ${responseJson.errors.map((e) => e.message).join(", ")}`
    );
  }

  const subscriptions = responseJson.data?.currentAppInstallation?.activeSubscriptions || [];

  return subscriptions.find((sub) => sub.status === "ACTIVE") || null;
}

/**
 * Cancel the shop's current active app subscription via the Shopify Billing API.
 * Used when a merchant downgrades to the FREE plan so they're no longer charged.
 * Returns the cancelled subscription payload, or null if there was no active subscription.
 *
 * @param {Object} admin - Authenticated Shopify admin API client
 * @returns {Promise<{id: string, status: string}|null>}
 */
export async function cancelCurrentSubscription(admin) {
  const current = await getCurrentSubscription(admin);
  if (!current?.id) {
    return null;
  }

  const mutation = `
    mutation appSubscriptionCancel($id: ID!) {
      appSubscriptionCancel(id: $id) {
        appSubscription {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: { id: current.id },
  });
  const responseJson = await response.json();

  const userErrors = responseJson.data?.appSubscriptionCancel?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(
      `Billing API errors: ${userErrors.map((e) => e.message).join(", ")}`
    );
  }

  return responseJson.data?.appSubscriptionCancel?.appSubscription || null;
}

/**
 * Map a Shopify Managed Pricing subscription to our internal plan enum
 * (FREE | GROWTH | PRO). Returns FREE if there's no active subscription.
 *
 * @param {Object|null} subscription - Result of getCurrentSubscription()
 * @returns {"FREE" | "GROWTH" | "PRO"}
 */
export function planFromSubscription(subscription) {
  if (!subscription || subscription.status !== "ACTIVE") return "FREE";
  const name = subscription.name || "";
  if (name.includes("Pro")) return "PRO";
  if (name.includes("Growth")) return "GROWTH";
  // Active subscription with an unrecognised name. Default to GROWTH so
  // we never accidentally downgrade a paying merchant. Caller should log.
  return "GROWTH";
}

/**
 * Sync shop.plan in our DB with the merchant's currently active Shopify
 * subscription. This is the source of truth for paid plans under Managed
 * Pricing — Shopify owns the subscription, we just mirror the state.
 *
 * Returns { changed, planBefore, planAfter }.
 *
 * Designed to be safe to call on every app entry: a fetch failure leaves
 * shop.plan untouched (returns changed=false) so we never block app entry
 * or accidentally downgrade on a transient Shopify API error.
 *
 * @param {Object} admin - Authenticated Shopify admin API client
 * @param {Object} shop - Shop row from the DB (must include id, plan, shopify_domain)
 * @returns {Promise<{changed: boolean, planBefore: string, planAfter: string}>}
 */
export async function syncShopPlanWithSubscription(admin, shop) {
  const planBefore = shop?.plan || "FREE";
  if (!shop?.id) return { changed: false, planBefore, planAfter: planBefore };

  let subscription = null;
  try {
    subscription = await getCurrentSubscription(admin);
  } catch (err) {
    console.error(
      `[billing.sync] Error fetching subscription for ${shop.shopify_domain}:`,
      err.message
    );
    return { changed: false, planBefore, planAfter: planBefore };
  }

  const planAfter = planFromSubscription(subscription);
  if (subscription?.status === "ACTIVE" && planAfter === "GROWTH" && !subscription.name?.includes("Growth")) {
    // planFromSubscription defaulted to GROWTH on an unrecognised name —
    // surface this in the logs so we notice plan-name drift in Shopify.
    console.warn(
      `[billing.sync] Unknown active subscription name "${subscription.name}" for ${shop.shopify_domain}; defaulting to GROWTH`
    );
  }

  if (planBefore === planAfter) {
    return { changed: false, planBefore, planAfter };
  }

  await updateShopPlan(shop.id, planAfter);
  return { changed: true, planBefore, planAfter };
}
