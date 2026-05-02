import { redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { updateShopPlan } from "../lib/db.server";
import { getCurrentSubscription } from "../lib/billing.server";

// Return URL after a merchant approves a Managed Pricing plan on Shopify's
// hosted page. We re-query the active subscription, sync shop.plan in our
// DB, then redirect back to /app/billing/select where the merchant sees
// the updated "Current Plan" badge — no intermediate success screen.
// Any per-plan trial is configured at the plan level in the Partner
// Dashboard, not here.
export const loader = async ({ request }) => {
  const { admin, shop } = await getShopWithPlan(request);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  const planParam = url.searchParams.get("plan");

  try {
    const subscription = await getCurrentSubscription(admin);

    if (!subscription || subscription.status !== "ACTIVE") {
      // No active subscription: a present charge_id means the charge was
      // declined; an absent one means the merchant cancelled mid-flow.
      const message = chargeId
        ? "The charge was declined or canceled. Please try again."
        : "No charge was found. Please try upgrading again.";
      return redirect(
        `/app/billing/select?error=${encodeURIComponent(message)}`
      );
    }

    const planToSet =
      planParam || (subscription.name.includes("Growth") ? "GROWTH" : "PRO");

    await updateShopPlan(shop.id, planToSet);

    return redirect("/app/billing/select");
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[billing] Error activating subscription:", error);
    return redirect(
      `/app/billing/select?error=${encodeURIComponent(
        "Failed to activate billing. Please contact support."
      )}`
    );
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
