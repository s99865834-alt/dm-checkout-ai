import { redirect } from "react-router";
import supabase from "../lib/supabase.server";

/**
 * Public route (no auth required) that stores a pending beta code
 * and redirects the store owner into the Shopify admin where the
 * embedded app picks it up automatically.
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

  throw redirect(
    `https://admin.shopify.com/store/${storeHandle}/apps/dm-checkout-ai/app`
  );
};

export default function Invite() {
  return null;
}
