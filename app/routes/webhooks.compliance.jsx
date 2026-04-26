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

import { authenticate } from "../shopify.server";
import supabase from "../lib/supabase.server";
import logger from "../lib/logger.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  logger.debug(`[webhook/compliance] Received ${topic} for ${shop}`);

  try {
    const { data: shopRow } = await supabase
      .from("shops")
      .select("id")
      .eq("shopify_domain", shop)
      .single();

    const dbShopId = shopRow?.id;

    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST": {
        // We don't store any per-customer data, so the only honest response
        // is an empty data set. We log the request so we can prove it was
        // received and acknowledged.
        const customerId = payload?.customer?.id ?? null;
        logger.debug(
          `[webhook/compliance] customers/data_request for shop=${shop} ` +
            `customer_id=${customerId} -> no stored data`
        );
        break;
      }

      case "CUSTOMERS_REDACT": {
        // Same posture: there is nothing customer-scoped to delete because
        // we never wrote any. Acknowledge and move on.
        const customerId = payload?.customer?.id ?? null;
        logger.debug(
          `[webhook/compliance] customers/redact for shop=${shop} ` +
            `customer_id=${customerId} -> no stored data to erase`
        );
        break;
      }

      case "SHOP_REDACT": {
        logger.debug(`[webhook/compliance] shop/redact for ${shop}`);
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
