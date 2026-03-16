/**
 * Mandatory Shopify compliance webhooks (GDPR / customer privacy).
 * Topics: customers/data_request, customers/redact, shop/redact.
 * Uses authenticate.webhook() which handles HMAC verification and returns
 * 401 Unauthorized automatically for invalid signatures.
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
        logger.debug(`[webhook/compliance] customers/data_request for ${shop}`);
        break;
      }

      case "CUSTOMERS_REDACT": {
        logger.debug(`[webhook/compliance] customers/redact for ${shop}`);
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
