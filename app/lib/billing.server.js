const PLAN_PRICING = {
  GROWTH: {
    amount: "39.00",
    name: "Growth Plan",
    description: "500 messages/month, DMs + Comment-to-DM, Brand voice, Store Q&A, Full analytics",
  },
  PRO: {
    amount: "99.00",
    name: "Pro Plan",
    description: "10,000 messages/month, Everything in Growth, Follow-ups, Multi-turn conversations, Per-post analytics",
  },
};

/**
 * Create a recurring charge using Shopify GraphQL Admin API
 * @param {Object} admin - Authenticated Shopify admin API client
 * @param {string} planName - The plan name (GROWTH or PRO)
 * @param {string} returnUrl - The URL to redirect to after confirmation
 * @param {Object} [options]
 * @param {number} [options.trialDays] - Number of free trial days (null = no trial)
 * @param {"STANDARD"|"APPLY_ON_NEXT_BILLING_CYCLE"} [options.replacementBehavior]
 *   How the new subscription interacts with an existing active one.
 *   STANDARD (default): the existing subscription is cancelled and replaced
 *   immediately when the merchant approves the new charge. Used for both
 *   upgrades (e.g. GROWTH -> PRO) and downgrades (e.g. PRO -> GROWTH).
 * @returns {Promise<{confirmationUrl: string, subscriptionId: string}>}
 */
export async function createChargeViaAPI(admin, planName, returnUrl, options = {}) {
  const plan = planName.toUpperCase();
  
  if (plan !== "GROWTH" && plan !== "PRO") {
    throw new Error(`Invalid plan: ${planName}. Must be GROWTH or PRO`);
  }

  const pricing = PLAN_PRICING[plan];
  if (!pricing) {
    throw new Error(`Pricing not found for plan: ${plan}`);
  }

  const isTestCharge = process.env.SHOPIFY_BILLING_TEST === "true";

  // Shopify allows only one active subscription per app per shop. When a merchant
  // already has an active subscription (e.g. switching GROWTH ↔ PRO),
  // appSubscriptionCreate produces a new pending subscription and the existing
  // one is automatically cancelled the moment the merchant approves the new
  // confirmationUrl. We pass STANDARD explicitly so the intent is obvious in
  // code and so any future default change on Shopify's side won't silently
  // alter our upgrade/downgrade UX.
  const mutation = `
    mutation appSubscriptionCreate(
      $name: String!,
      $returnUrl: URL!,
      $lineItems: [AppSubscriptionLineItemInput!]!,
      $trialDays: Int,
      $test: Boolean,
      $replacementBehavior: AppSubscriptionReplacementBehavior
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        trialDays: $trialDays
        test: $test
        replacementBehavior: $replacementBehavior
      ) {
        appSubscription {
          id
          name
          status
          currentPeriodEnd
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    name: pricing.name,
    returnUrl: returnUrl,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: pricing.amount,
              currencyCode: "USD",
            },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
    trialDays: options.trialDays ?? null,
    test: isTestCharge || null,
    replacementBehavior: options.replacementBehavior || "STANDARD",
  };

  const response = await admin.graphql(mutation, {
    variables,
  });

  const responseJson = await response.json();

  if (responseJson.data?.appSubscriptionCreate?.userErrors?.length > 0) {
    const errors = responseJson.data.appSubscriptionCreate.userErrors;
    throw new Error(`Billing API errors: ${errors.map(e => e.message).join(", ")}`);
  }

  if (!responseJson.data?.appSubscriptionCreate?.confirmationUrl) {
    throw new Error("Failed to create charge: No confirmation URL returned");
  }

  return {
    confirmationUrl: responseJson.data.appSubscriptionCreate.confirmationUrl,
    subscriptionId: responseJson.data.appSubscriptionCreate.appSubscription?.id,
  };
}

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
