// Polyfill crypto for Shopify webhook validation
// The Shopify library expects crypto to be available globally
import crypto from "crypto";

// Make crypto available globally for Shopify library
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}

import { authenticateWebhookTolerant } from "../lib/webhook-auth.server";
import { getShopByDomain } from "../lib/db.server";
import { syncShopPlanWithSubscription } from "../lib/billing.server";
import logger from "../lib/logger.server";

/**
 * app_subscriptions/update: the merchant's app subscription changed status.
 *
 * Without this, shop.plan was only ever written when a merchant came back
 * through /app/billing/activate, so every other way a subscription can end
 * (cancelling from the Shopify admin, a declined card, a frozen or expired
 * subscription) left the shop on its paid plan forever. It kept paid
 * capabilities and went on being counted as a paying store.
 *
 * The payload carries a status, and we deliberately ignore it. Changing plan
 * emits a CANCELLED for the outgoing subscription and an ACTIVE for the
 * incoming one, with no ordering guarantee, so acting on a status can downgrade
 * a merchant who just upgraded. Asking Shopify what is active right now is
 * idempotent and order-independent, which is what a retried webhook needs.
 */
export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }) => {
  try {
    const { shop: shopDomain, topic, admin, payload } =
      await authenticateWebhookTolerant(request);

    logger.debug(
      `[webhook] ${topic} for ${shopDomain} (payload status: ${payload?.app_subscription?.status || "unknown"})`
    );

    // No admin client means the shop's tokens are already revoked, which is
    // what an uninstall looks like: Shopify auto-cancels the subscription and
    // both webhooks land together. app/uninstalled resets the plan, so there
    // is nothing to do here and nothing to retry.
    if (!admin) {
      logger.debug(`[webhook] No admin client for ${shopDomain}; uninstall path owns this`);
      return new Response(null, { status: 200 });
    }

    const shop = await getShopByDomain(shopDomain);
    if (!shop) {
      logger.debug(`[webhook] No shop row for ${shopDomain}; nothing to reconcile`);
      return new Response(null, { status: 200 });
    }

    const { changed, planBefore, planAfter } = await syncShopPlanWithSubscription(admin, shop);
    if (changed) {
      // console.log, not logger.info: logger.info is a noop in production and
      // a plan change is the one thing here worth seeing in production logs.
      console.log(`[billing.sync] ${shopDomain} plan ${planBefore} -> ${planAfter}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    // 401/400 from HMAC validation must pass through untouched so forged
    // requests are rejected with the right status.
    if (error instanceof Response) throw error;
    // Anything else (a failed plan write) is worth a retry, so 500 rather than
    // swallowing: getting this wrong means a cancelled merchant keeps paid
    // features indefinitely.
    console.error(`[webhook] Error processing app_subscriptions/update:`, error);
    return new Response(JSON.stringify({ error: error?.message || "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
