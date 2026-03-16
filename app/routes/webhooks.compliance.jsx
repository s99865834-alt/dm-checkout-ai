/**
 * Mandatory Shopify compliance webhooks (GDPR / customer privacy).
 * Required for App Store: customers/data_request, customers/redact, shop/redact.
 * Must verify X-Shopify-Hmac-Sha256 and return 401 if invalid.
 */

import crypto from "crypto";
import supabase from "../lib/supabase.server";
import logger from "../lib/logger.server";

const HMAC_HEADER = "x-shopify-hmac-sha256";

function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  if (!secret || !hmacHeader) return false;
  try {
    const computed = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    const expected = Buffer.from(hmacHeader.trim(), "utf8");
    const actual = Buffer.from(computed, "utf8");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  const hmacHeader = request.headers.get(HMAC_HEADER);
  const secret = process.env.SHOPIFY_API_SECRET || "";

  if (!verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    logger.debug("[webhook/compliance] HMAC verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    console.error("[webhook/compliance] Invalid JSON payload:", e?.message);
    return new Response("Bad Request", { status: 400 });
  }

  const shopDomain = payload.shop_domain;
  if (!shopDomain) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { data: shopRow } = await supabase
      .from("shops")
      .select("id")
      .eq("shopify_domain", shopDomain)
      .single();

    const dbShopId = shopRow?.id;

    if (payload.orders_requested != null && payload.customer != null) {
      logger.debug(`[webhook/compliance] customers/data_request for ${shopDomain}`);
    } else if (payload.orders_to_redact != null && payload.customer != null) {
      logger.debug(`[webhook/compliance] customers/redact for ${shopDomain}`);
    } else if (payload.shop_id != null && !payload.customer) {
      logger.debug(`[webhook/compliance] shop/redact for ${shopDomain}`);
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
        logger.debug(`[webhook/compliance] Shop ${shopDomain} data erased`);
      }
    }
  } catch (err) {
    console.error("[webhook/compliance] Error processing:", err?.message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
