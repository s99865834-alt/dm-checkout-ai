import { authenticate } from "../shopify.server";
import db from "../db.server";
import supabase from "../lib/supabase.server";
import { updateShopPlan } from "../lib/db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Get shop from database to check if they have an active subscription
  const { data: shopData } = await supabase
    .from("shops")
    .select("id, plan")
    .eq("shopify_domain", shop)
    .single();

  // Note: Shopify automatically cancels subscriptions when an app is uninstalled,
  // but we should also handle it here for consistency and to update our database.
  // TODO: In Week 4, add billing cancellation logic here:
  // - If shop has GROWTH or PRO plan, cancel the Shopify subscription via Billing API
  // - This is a safety measure (Shopify handles it automatically, but good to be explicit)
  
  // Mark shop as inactive and reset to FREE plan in Supabase
  try {
    if (shopData) {
      // Reset plan to FREE when uninstalled
      await updateShopPlan(shopData.id, "FREE");
    }

    const { error } = await supabase
      .from("shops")
      .update({ active: false })
      .eq("shopify_domain", shop);

    if (error) {
      console.error(`Error marking shop ${shop} as inactive:`, error);
    } else {
      console.log(`Shop ${shop} marked as inactive and plan reset to FREE`);
    }
  } catch (error) {
    console.error(`Error updating shop ${shop} status:`, error);
  }

  return new Response();
};
