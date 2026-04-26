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

import { authenticate } from "../shopify.server";
import db from "../db.server";
import supabase from "../lib/supabase.server";
import { updateShopPlan } from "../lib/db.server";
import logger from "../lib/logger.server";

export const action = async ({ request }) => {
  logger.debug(`[webhook] app/uninstalled webhook received`);
  
  try {
    const { shop, session, topic } = await authenticate.webhook(request);
    logger.debug(`[webhook] Authenticated webhook for shop: ${shop}, topic: ${topic}`);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      logger.debug(`[webhook] Deleting session for shop: ${shop}`);
      await db.session.deleteMany({ where: { shop } });
      logger.debug(`[webhook] Session deleted`);
    } else {
      logger.debug(`[webhook] No session found (may have been deleted already)`);
    }

    // Get shop from database to check if they have an active subscription
    logger.debug(`[webhook] Fetching shop data from database for: ${shop}`);
    const { data: shopData, error: fetchError } = await supabase
      .from("shops")
      .select("id, plan")
      .eq("shopify_domain", shop)
      .single();

    if (fetchError) {
      console.error(`[webhook] Error fetching shop data:`, fetchError);
    } else {
      logger.debug(`[webhook] Shop data found:`, shopData);
    }

    // Shopify automatically cancels any active app subscription when a merchant
    // uninstalls the app (per the Billing API contract), and revokes the access
    // token shortly after. Calling appSubscriptionCancel here is therefore
    // unnecessary and would actually fail because we no longer have a valid
    // session to authenticate the request. We only need to mirror the billing
    // state in our own DB so the merchant goes through the re-approval flow on
    // reinstall (handled by afterAuth + loader-helpers).
    // Reset plan to FREE and mark inactive in Supabase.
    if (shopData) {
      logger.debug(`[webhook] Resetting plan to FREE for shop ID: ${shopData.id}`);
      try {
        await updateShopPlan(shopData.id, "FREE");
        logger.debug(`[webhook] Plan reset to FREE`);
      } catch (planError) {
        console.error(`[webhook] Error resetting plan:`, planError);
      }
    }

    logger.debug(`[webhook] Updating shop active status to false for: ${shop}`);
    const { data: updateData, error: updateError } = await supabase
      .from("shops")
      .update({ active: false })
      .eq("shopify_domain", shop)
      .select();

    if (updateError) {
      console.error(`[webhook] Error marking shop ${shop} as inactive:`, updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      logger.debug(`[webhook] Shop ${shop} marked as inactive successfully. Updated rows:`, updateData);
      return new Response(JSON.stringify({ success: true, updated: updateData }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error(`[webhook] Error processing app/uninstalled webhook:`, error);
    console.error(`[webhook] Error stack:`, error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
