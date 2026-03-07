import { redirect } from "react-router";
import supabase from "../lib/supabase.server";

const APP_URL = (process.env.SHOPIFY_APP_URL || "https://dm-checkout-ai-production.up.railway.app").replace(/\/$/, "");
const CLIENT_ID = process.env.SHOPIFY_API_KEY;

/**
 * Public route (no auth required) that stores a pending beta code
 * and redirects the store owner through the Shopify OAuth/install flow.
 * After auth completes, the app home page picks up the pending code
 * from Supabase and routes to the beta activation page.
 *
 * URL format:
 *   /invite?beta_code=BETA-XXXX-XXXX&shop=storename
 *   /invite?beta_code=BETA-XXXX-XXXX&shop=storename.myshopify.com
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const betaCode = url.searchParams.get("beta_code");
  const shopParam = url.searchParams.get("shop");

  if (!betaCode || !shopParam) {
    return new Response("Missing beta_code or shop parameter.", { status: 400 });
  }

  const storeHandle = shopParam.replace(".myshopify.com", "").trim();
  const shopDomain = `${storeHandle}.myshopify.com`;
  const code = betaCode.trim().toUpperCase();

  const { data: betaCodeRow } = await supabase
    .from("beta_codes")
    .select("id, active, expires_at, times_used, max_uses")
    .eq("code", code)
    .single();

  if (!betaCodeRow) {
    return new Response("Invalid beta code.", { status: 404 });
  }
  if (!betaCodeRow.active) {
    return new Response("This beta code has been deactivated.", { status: 410 });
  }
  if (betaCodeRow.expires_at && new Date(betaCodeRow.expires_at) < new Date()) {
    return new Response("This beta code has expired.", { status: 410 });
  }
  if (betaCodeRow.times_used >= betaCodeRow.max_uses) {
    return new Response("This beta code has already been fully redeemed.", { status: 410 });
  }

  await supabase
    .from("pending_beta_activations")
    .upsert({ shop_domain: shopDomain, beta_code: code }, { onConflict: "shop_domain" });

  // Redirect through the Shopify install/OAuth flow.
  // This works whether the app is installed or not:
  //   - Not installed: prompts install → OAuth → creates session → lands in app
  //   - Already installed: re-authenticates → creates fresh session → lands in app
  throw redirect(
    `https://admin.shopify.com/store/${storeHandle}/oauth/install?client_id=${CLIENT_ID}`
  );
};

export default function Invite() {
  return null;
}
