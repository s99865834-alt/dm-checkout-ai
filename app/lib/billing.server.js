import { authenticate } from "../shopify.server";
import { getShopByDomain } from "./db.server";
import { getPlanConfig } from "./plans";

/**
 * Plan pricing configuration
 */
const PLAN_PRICING = {
  GROWTH: {
    amount: "29.00",
    name: "Growth Plan",
    description: "500 messages/month, Comments automation, Conversations, Brand voice",
  },
  PRO: {
    amount: "99.00",
    name: "Pro Plan",
    description: "50,000 messages/month, All Growth features, Follow-ups, Priority support",
  },
};

/**
 * Create a recurring charge for a shop
 * @param {string} shopDomain - The shop domain
 * @param {string} planName - The plan name (GROWTH or PRO)
 * @param {string} returnUrl - The URL to redirect to after confirmation
 * @returns {Promise<{confirmationUrl: string, chargeId: string}>}
 */
export async function createRecurringCharge(shopDomain, planName, returnUrl) {
  const plan = planName.toUpperCase();
  
  if (plan !== "GROWTH" && plan !== "PRO") {
    throw new Error(`Invalid plan: ${planName}. Must be GROWTH or PRO`);
  }

  const pricing = PLAN_PRICING[plan];
  if (!pricing) {
    throw new Error(`Pricing not found for plan: ${plan}`);
  }

  // Get shop to verify it exists
  const shop = await getShopByDomain(shopDomain);
  if (!shop) {
    throw new Error(`Shop not found: ${shopDomain}`);
  }

  // Get admin API access
  // Note: We need to authenticate the request to get admin access
  // This function should be called from a route that has already authenticated
  // For now, we'll accept the admin object as a parameter

  // The actual charge creation will be done in the route that calls this
  // because we need the authenticated admin object from the request
  return {
    plan,
    pricing,
    shop,
  };
}

/**
 * Create a recurring charge using Shopify GraphQL Admin API
 * @param {Object} admin - Authenticated Shopify admin API client
 * @param {string} planName - The plan name (GROWTH or PRO)
 * @param {string} returnUrl - The URL to redirect to after confirmation
 * @returns {Promise<{confirmationUrl: string, chargeId: string}>}
 */
export async function createChargeViaAPI(admin, planName, returnUrl) {
  const plan = planName.toUpperCase();
  
  if (plan !== "GROWTH" && plan !== "PRO") {
    throw new Error(`Invalid plan: ${planName}. Must be GROWTH or PRO`);
  }

  const pricing = PLAN_PRICING[plan];
  if (!pricing) {
    throw new Error(`Pricing not found for plan: ${plan}`);
  }

  // Create recurring charge via GraphQL
  const mutation = `
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $trialDays: Int) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        trialDays: $trialDays
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
    trialDays: null, // No trial period
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
  const query = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          currentPeriodEnd
          lineItems {
            id
            plan {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const responseJson = await response.json();

  const subscriptions = responseJson.data?.currentAppInstallation?.activeSubscriptions || [];
  
  // Return the first active subscription (should only be one)
  return subscriptions.find(sub => sub.status === "ACTIVE") || null;
}

