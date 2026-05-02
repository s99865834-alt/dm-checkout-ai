import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopByDomain } from "../lib/db.server";
import { syncShopPlanWithSubscription } from "../lib/billing.server";

// Shopify's hosted Managed Pricing page redirects merchants back to the
// app's root (application_url) after charge approval — it does NOT send
// a charge_id query param to a custom return URL we control. So we can't
// rely on /app/billing/activate to handle the post-approval flow.
//
// Instead, we sync shop.plan with the merchant's active Shopify
// subscription on entry to the app. If the sync changes anything, the
// merchant most likely just approved (or cancelled) a plan on Shopify's
// hosted page — route them to /app/billing/select so they immediately
// see the updated "Current Plan" badge. Otherwise, send them to the
// dashboard (the normal app entry).
//
// This route also covers the simple case of the merchant clicking the
// app icon in Shopify admin (which opens the app's main URL — i.e. /).
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  let landTarget = "/app";

  try {
    const shop = await getShopByDomain(session.shop);
    if (shop?.id) {
      const { changed } = await syncShopPlanWithSubscription(admin, shop);
      if (changed) landTarget = "/app/billing/select";
    }
  } catch (err) {
    // Never block app entry on a sync failure — fall through to the
    // dashboard. Stale plan badge is recoverable; broken app entry is not.
    console.error("[index] Error syncing plan on entry:", err);
  }

  return redirect(landTarget);
};

export const headers = (headersArgs) => boundary.headers(headersArgs);
