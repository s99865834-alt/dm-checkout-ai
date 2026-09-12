import { redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { updateShopPlan } from "../lib/db.server";
import { invalidateCached } from "../lib/loader-cache.server";
import { getCurrentSubscription } from "../lib/billing.server";
import { resolveActivationPlan } from "../lib/plan-resolution";

// Return URL after a merchant approves a Managed Pricing plan on Shopify's
// hosted page. We re-query the active subscription, sync shop.plan in our
// DB, then redirect back to /app/billing/select where the merchant sees
// the updated "Current Plan" badge — no intermediate success screen.
// Any per-plan trial is configured at the plan level in the Partner
// Dashboard, not here.
//
// IMPORTANT: redirects MUST preserve the embedded auth query params
// (id_token, host, shop, embedded, hmac, locale, session, timestamp).
// Without those, the next request hits the framework's auth middleware
// with no credentials and bounces to /auth/login (the install page).
// Use buildBillingSelectUrl below for every redirect from this route.
function buildBillingSelectUrl(request, error) {
  const url = new URL(request.url);
  url.pathname = "/app/billing/select";
  // charge_id and plan are activation-flow specific; strip them so the
  // billing page URL stays clean. Everything else (id_token, shop, host,
  // embedded, hmac, locale, session, timestamp) carries over so the next
  // request still authenticates as an embedded admin request.
  url.searchParams.delete("charge_id");
  url.searchParams.delete("plan");
  if (error) {
    url.searchParams.set("error", error);
  } else {
    url.searchParams.delete("error");
  }
  return `${url.pathname}${url.search}`;
}

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
    // The billing page caches this lookup; the merchant just came back from
    // Shopify's pricing page, so whatever is cached is now suspect.
    invalidateCached(`subscription:${shop.id}`);

    if (!subscription || subscription.status !== "ACTIVE") {
      // No active subscription: a present charge_id means the charge was
      // declined; an absent one means the merchant cancelled mid-flow.
      const message = chargeId
        ? "The charge was declined or canceled. Please try again."
        : "No charge was found. Please try upgrading again.";
      return redirect(buildBillingSelectUrl(request, message));
    }

    // The live subscription decides, and the plan= param Shopify appends is
    // only a fallback for a subscription name we don't recognise. The other
    // way round, a merchant holding any active subscription could replay this
    // GET with ?plan=PRO and hold Pro capabilities on a Growth charge. If
    // neither resolves we leave shop.plan alone, because silently downgrading
    // a paying merchant is the worst outcome here.
    const planToSet = resolveActivationPlan(subscription, planParam);

    if (planToSet) {
      await updateShopPlan(shop.id, planToSet);
      // Trial status is cached for the home-page banner; the plan just
      // changed, so recompute it on the next load.
      invalidateCached(`trial:${shop.id}`);
    } else {
      console.warn(
        `[billing] Could not resolve plan for charge_id=${chargeId} subscription="${subscription?.name}"; leaving shop.plan untouched`
      );
    }

    return redirect(buildBillingSelectUrl(request));
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[billing] Error activating subscription:", error);
    return redirect(
      buildBillingSelectUrl(
        request,
        "Failed to activate billing. Please contact support."
      )
    );
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
