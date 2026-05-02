// Billing helpers for a Managed Pricing app. We do NOT call appSubscriptionCreate
// — Managed Pricing apps use Shopify's hosted pricing page for plan selection
// and approval. We only query for the active subscription (to sync shop.plan)
// and cancel on FREE downgrade (which is permitted under Managed Pricing).

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
