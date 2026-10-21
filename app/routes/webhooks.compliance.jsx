/**
 * Mandatory Shopify compliance webhooks (GDPR / customer privacy).
 * Topics handled: customers/data_request, customers/redact, shop/redact.
 *
 * authenticate.webhook() performs HMAC verification and returns 401 for
 * invalid signatures, so this handler only runs for genuine Shopify requests.
 *
 * Customer-data posture (relevant for App Store / privacy review):
 *   This app does NOT read, store, or process any Shopify customer PII.
 *   The orders/create webhook payload contains customer data, but our
 *   handler in app/routes/webhooks.shopify.orders.jsx only reads order ID,
 *   total_price, currency, landing_site, and referring_site — never any
 *   customer.* field. We have no customer_id, email, name, address, or
 *   phone column in our database (verifiable in prisma/schema.prisma and
 *   the Supabase migrations).
 *
 *   As a result, customers/data_request and customers/redact are
 *   intentional no-ops: there is no customer-scoped data to return or
 *   erase. shop/redact does perform a full cascade delete of all shop-
 *   scoped data (messages, links, attribution, settings, etc.) so that a
 *   merchant who uninstalls is wiped 48 hours later as required.
 */

import crypto from "crypto";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}

import { authenticateWebhookTolerant } from "../lib/webhook-auth.server";
import { readVerifiedShopifyWebhook } from "../lib/shopify-webhook-hmac.server";
import supabase from "../lib/supabase.server";
import logger from "../lib/logger.server";

/**
 * Topics with nothing to do, so nothing to look up.
 *
 * The app stores no Shopify customer PII (see the file header), which makes
 * both of these guaranteed no-ops. They are answered from the signature alone,
 * without loading a session or querying Supabase, because on 17 Oct 2026 a
 * bulk customer redaction delivered ~160 of them in one second, each queued
 * behind the others on this app's single pooled Prisma connection, and Shopify
 * timed out at 5 seconds on most of the burst.
 */
const NO_OP_TOPICS = new Set(["CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT"]);

// Webhooks are POST-only; answer crawler GETs with a 405 instead of letting
// React Router warn about rendering a component-less route.
export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }) => {
  // Read and verify first, without touching the database. A request that
  // fails the signature check never reaches the session store, and the two
  // no-op topics are answered before anything can queue.
  const verified = await readVerifiedShopifyWebhook(request.clone());

  if (verified.valid && NO_OP_TOPICS.has(verified.topic)) {
    logger.debug(
      `[webhook/compliance] ${verified.topic} for shop=${verified.shop} ` +
        `customer_id=${verified.payload?.customer?.id ?? null} -> no stored data, acknowledged`
    );
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Anything else (shop/redact, or a request our own check could not verify)
  // goes through the library, which is still the authority on authentication.
  //
  // Tolerant auth: shop/redact arrives 48 hours AFTER uninstall, when the
  // shop's tokens are already revoked — the library's token-refresh step
  // would 500 on an otherwise-authentic webhook. Failing mandatory
  // compliance webhooks risks App Store standing, so never let that happen.
  const { topic, shop, payload } = await authenticateWebhookTolerant(request);

  logger.debug(`[webhook/compliance] Received ${topic} for ${shop}`);

  try {
    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
      case "CUSTOMERS_REDACT": {
        // Reached only when the fast path could not verify the signature
        // itself, e.g. a secret rotation mid-flight. Same no-op either way.
        const customerId = payload?.customer?.id ?? null;
        logger.debug(
          `[webhook/compliance] ${topic} for shop=${shop} ` +
            `customer_id=${customerId} -> no stored data (library path)`
        );
        break;
      }

      case "SHOP_REDACT": {
        logger.debug(`[webhook/compliance] shop/redact for ${shop}`);
        // Only this topic needs to know who the shop is, so the lookup lives
        // here rather than running for every delivery.
        const { data: shopRow } = await supabase
          .from("shops")
          .select("id")
          .eq("shopify_domain", shop)
          .single();
        const dbShopId = shopRow?.id;
        if (dbShopId) {
          await supabase.from("messages").delete().eq("shop_id", dbShopId);
          await supabase.from("links_sent").delete().eq("shop_id", dbShopId);
          await supabase.from("attribution").delete().eq("shop_id", dbShopId);
          await supabase.from("settings").delete().eq("shop_id", dbShopId);
          await supabase.from("post_product_map").delete().eq("shop_id", dbShopId);
          await supabase.from("brand_voice").delete().eq("shop_id", dbShopId);
          await supabase.from("clicks").delete().eq("shop_id", dbShopId);
          await supabase.from("followups").delete().eq("shop_id", dbShopId);
          await supabase.from("outbound_dm_queue").delete().eq("shop_id", dbShopId);
          await supabase.from("beta_redemptions").delete().eq("shop_id", dbShopId);
          await supabase.from("meta_auth").delete().eq("shop_id", dbShopId);
          await supabase.from("shops").delete().eq("id", dbShopId);
          logger.debug(`[webhook/compliance] Shop ${shop} data erased`);
        }
        break;
      }

      default:
        logger.debug(`[webhook/compliance] Unhandled compliance topic: ${topic}`);
    }
  } catch (err) {
    console.error("[webhook/compliance] Error processing:", err?.message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
