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
          createdAt
          trialDays
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
 * Compute free-trial status from a subscription's createdAt + trialDays.
 * Shopify delays the first charge until the trial ends; during the trial the
 * subscription is already status ACTIVE, so this is the only way to tell a
 * trialing merchant from a paying one.
 *
 * @param {Object|null} subscription - Result of getCurrentSubscription()
 * @returns {{daysLeft: number, trialEndsAt: Date}|null} null when not in a trial
 */
export function getTrialStatus(subscription) {
  if (!subscription || subscription.status !== "ACTIVE") return null;
  const trialDays = Number(subscription.trialDays) || 0;
  if (trialDays <= 0 || !subscription.createdAt) return null;

  const trialEndsAt = new Date(
    new Date(subscription.createdAt).getTime() + trialDays * 24 * 60 * 60 * 1000
  );
  const msLeft = trialEndsAt.getTime() - Date.now();
  if (msLeft <= 0) return null;

  return {
    daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
    trialEndsAt,
  };
}

/**
 * Map a Shopify Managed Pricing subscription to our internal plan enum.
 *
 * Returns:
 *   - "FREE" if there's no active subscription (the merchant is genuinely
 *     on the free tier)
 *   - "PRO" or "GROWTH" if the subscription name unambiguously matches
 *     (case-insensitive)
 *   - null if there IS an active subscription but its name doesn't map
 *     to one of our known plans. Callers MUST treat null as "I don't
 *     know — leave shop.plan alone" rather than silently downgrading.
 *
 * @param {Object|null} subscription - Result of getCurrentSubscription()
 * @returns {"FREE" | "GROWTH" | "PRO" | null}
 */
export function planFromSubscription(subscription) {
  if (!subscription || subscription.status !== "ACTIVE") return "FREE";
  const name = (subscription.name || "").toLowerCase();
  if (name.includes("pro")) return "PRO";
  if (name.includes("growth")) return "GROWTH";
  return null;
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

  const mapped = planFromSubscription(subscription);
  if (mapped === null) {
    console.warn(
      `[billing.sync] Unknown active subscription name "${subscription?.name}" for ${shop.shopify_domain}; leaving shop.plan="${planBefore}" untouched`
    );
    return { changed: false, planBefore, planAfter: planBefore };
  }

  if (planBefore === mapped) {
    return { changed: false, planBefore, planAfter: mapped };
  }

  await updateShopPlan(shop.id, mapped);
  return { changed: true, planBefore, planAfter: mapped };
}
