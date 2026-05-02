import { redirect, useLoaderData, useSearchParams, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { updateShopPlan } from "../lib/db.server";
import { getCurrentSubscription } from "../lib/billing.server";

// Return URL after a merchant approves a Managed Pricing plan on Shopify's
// hosted page. We re-query the active subscription and sync shop.plan in our
// DB. Any trial period is a property of the plan itself (configured in the
// Partner Dashboard), so there is no per-merchant trial logic to handle here.
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
      // Without an active subscription, treat a missing charge_id as
      // "merchant cancelled mid-flow" and a present charge_id as declined.
      if (!chargeId) {
        throw redirect("/app/billing/select?error=no_charge");
      }
      return {
        success: false,
        error: "charge_declined",
        message: "The charge was not approved or was declined. Please try again.",
      };
    }

    const planToSet = planParam || (subscription.name.includes("Growth") ? "GROWTH" : "PRO");

    await updateShopPlan(shop.id, planToSet);

    return {
      success: true,
      plan: planToSet,
      message: `Successfully upgraded to ${planToSet} plan!`,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Error activating billing:", error);
    return {
      success: false,
      error: "activation_failed",
      message: "Failed to activate billing. Please contact support.",
    };
  }
};

export default function BillingActivate() {
  const data = useLoaderData();
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  if (error === "no_charge") {
    return (
      <s-page heading="Billing Activation">
        <s-section>
          <s-callout variant="warning" title="No Charge Found">
            <s-paragraph>
              No billing charge was found. Please try upgrading again from the billing page.
            </s-paragraph>
            <s-button href="/app/billing/select" variant="primary">
              Go to Billing
            </s-button>
          </s-callout>
        </s-section>
      </s-page>
    );
  }

  if (data.success) {
    return (
      <s-page heading="Plan Activated">
        <s-section>
          <s-callout variant="success" title="Upgrade Successful!">
            <s-paragraph>
              <s-text variant="strong">{data.message}</s-text>
            </s-paragraph>
            <s-paragraph>
              Your plan has been updated and you now have access to all {data.plan} plan features.
            </s-paragraph>
            <s-button href="/app" variant="primary">
              Go to Dashboard
            </s-button>
          </s-callout>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Billing Activation">
      <s-section>
        <s-callout variant="critical" title="Activation Failed">
          <s-paragraph>
            <s-text variant="strong">{data.message || "An error occurred during activation."}</s-text>
          </s-paragraph>
          {data.error === "charge_declined" && (
            <s-paragraph>
              The billing charge was declined or canceled. Please try upgrading again.
            </s-paragraph>
          )}
          <s-button href="/app/billing/select" variant="primary">
            Try Again
          </s-button>
        </s-callout>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

