import { authenticate } from "../shopify.server";
import db from "../db.server";
import supabase from "../lib/supabase.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Mark shop as inactive in Supabase
  try {
    const { error } = await supabase
      .from("shops")
      .update({ active: false })
      .eq("shopify_domain", shop);

    if (error) {
      console.error(`Error marking shop ${shop} as inactive:`, error);
    } else {
      console.log(`Shop ${shop} marked as inactive`);
    }
  } catch (error) {
    console.error(`Error updating shop ${shop} status:`, error);
  }

  return new Response();
};
