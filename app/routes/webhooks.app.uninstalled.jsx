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

export const action = async ({ request }) => {
  console.log(`[webhook] app/uninstalled webhook received`);
  
  try {
    const { shop, session, topic } = await authenticate.webhook(request);
    console.log(`[webhook] Authenticated webhook for shop: ${shop}, topic: ${topic}`);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      console.log(`[webhook] Deleting session for shop: ${shop}`);
      await db.session.deleteMany({ where: { shop } });
      console.log(`[webhook] Session deleted`);
    } else {
      console.log(`[webhook] No session found (may have been deleted already)`);
    }

    // Get shop from database to check if they have an active subscription
    console.log(`[webhook] Fetching shop data from database for: ${shop}`);
    const { data: shopData, error: fetchError } = await supabase
      .from("shops")
      .select("id, plan")
      .eq("shopify_domain", shop)
      .single();

    if (fetchError) {
      console.error(`[webhook] Error fetching shop data:`, fetchError);
    } else {
      console.log(`[webhook] Shop data found:`, shopData);
    }

    // Note: Shopify automatically cancels subscriptions when an app is uninstalled,
    // but we should also handle it here for consistency and to update our database.
    // TODO: In Week 4, add billing cancellation logic here:
    // - If shop has GROWTH or PRO plan, cancel the Shopify subscription via Billing API
    // - This is a safety measure (Shopify handles it automatically, but good to be explicit)
    
    // Mark shop as inactive and reset to FREE plan in Supabase
    if (shopData) {
      console.log(`[webhook] Resetting plan to FREE for shop ID: ${shopData.id}`);
      try {
        await updateShopPlan(shopData.id, "FREE");
        console.log(`[webhook] Plan reset to FREE`);
      } catch (planError) {
        console.error(`[webhook] Error resetting plan:`, planError);
      }
    }

    console.log(`[webhook] Updating shop active status to false for: ${shop}`);
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
      console.log(`[webhook] Shop ${shop} marked as inactive successfully. Updated rows:`, updateData);
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
