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
import db from "../db.server";
import { markShopUninstalled, getShopByDomain } from "../lib/db.server";
import { unsubscribeInstagramWebhooks } from "../lib/meta.server";
import logger from "../lib/logger.server";

// Webhooks are POST-only; answer crawler GETs with a 405 instead of letting
// React Router warn about rendering a component-less route.
export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }) => {
  logger.debug(`[webhook] app/uninstalled webhook received`);

  try {
    // Tolerant auth is essential here: Shopify revokes the shop's access AND
    // refresh tokens the moment the merchant uninstalls, then sends this
    // webhook — so the library's token-refresh step always fails for it.
    // authenticateWebhookTolerant recognizes that (post-HMAC) failure and
    // returns a header-derived context instead of throwing a 500.
    const { shop, topic } = await authenticateWebhookTolerant(request);
    logger.debug(`[webhook] Authenticated webhook for shop: ${shop}, topic: ${topic}`);

    // Idempotent cleanup — this webhook can be delivered multiple times.
    // 1. Delete session rows (tokens are revoked; keeping them makes every
    //    later webhook for this shop trip over a doomed refresh).
    try {
      await db.session.deleteMany({ where: { shop } });
      logger.debug(`[webhook] Sessions deleted for ${shop}`);
    } catch (sessionError) {
      console.error(`[webhook] Error deleting sessions for ${shop}:`, sessionError?.message);
    }

    // 2. Mirror the uninstall in our DB: active=false and plan back to FREE
    //    (Shopify auto-cancels any subscription on uninstall; the merchant
    //    must re-approve a paid charge on reinstall per App Store rules).
    await markShopUninstalled(shop);
    logger.debug(`[webhook] Shop ${shop} marked uninstalled (inactive, plan FREE)`);

    // 3. Tell Meta to stop sending this account's DMs and comments. Uninstall
    //    used to leave the Instagram subscription in place, so Meta kept
    //    delivering a former merchant's customer conversations indefinitely
    //    and the meta webhook logged and discarded them. Best-effort, and
    //    deliberately after the steps above: the uninstall must be recorded
    //    even if Meta is unreachable.
    try {
      const shopRow = await getShopByDomain(shop);
      if (shopRow?.id) {
        await unsubscribeInstagramWebhooks(shopRow.id);
      }
    } catch (metaError) {
      console.warn(
        `[webhook] Could not unsubscribe Meta webhooks for ${shop}:`,
        metaError?.message || metaError,
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // 401/400 from HMAC validation must pass through untouched so forged
    // requests are rejected with the right status.
    if (error instanceof Response) throw error;
    console.error(`[webhook] Error processing app/uninstalled webhook:`, error);
    return new Response(JSON.stringify({ error: error?.message || "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
