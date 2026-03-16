import { redirect, useLoaderData, useSearchParams, useRouteError, useNavigate } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { updateShopPlan, validateAndRedeemBetaCode } from "../lib/db.server";
import { getCurrentSubscription } from "../lib/billing.server";
import { getPlanConfig } from "../lib/plans";

export const loader = async ({ request }) => {
  const { admin, session, shop } = await getShopWithPlan(request);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  const planParam = url.searchParams.get("plan");
  const betaCode = url.searchParams.get("beta_code");

  if (!chargeId) {
    try {
      const subscription = await getCurrentSubscription(admin);
      if (subscription && subscription.status === "ACTIVE") {
        const planToSet = planParam || (subscription.name.includes("Growth") ? "GROWTH" : "PRO");

        await updateShopPlan(shop.id, planToSet);

        if (betaCode) {
          await validateAndRedeemBetaCode(shop.id, betaCode);
        }

        return {
          success: true,
          plan: planToSet,
          isBeta: !!betaCode,
          message: betaCode
            ? `Pro trial activated! You have full Pro access for 60 days free.`
            : `Successfully upgraded to ${planToSet} plan!`,
        };
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
    }

    throw redirect("/app/billing/select?error=no_charge");
  }

  try {
    const subscription = await getCurrentSubscription(admin);

    if (!subscription || subscription.status !== "ACTIVE") {
      return {
        success: false,
        error: "charge_declined",
        message: "The charge was not approved or was declined. Please try again.",
      };
    }

    const planToSet = planParam || (subscription.name.includes("Growth") ? "GROWTH" : "PRO");

    await updateShopPlan(shop.id, planToSet);

    if (betaCode) {
      await validateAndRedeemBetaCode(shop.id, betaCode);
    }

    return {
      success: true,
      plan: planToSet,
      isBeta: !!betaCode,
      message: betaCode
        ? `Pro trial activated! You have full Pro access for 60 days free. After the trial, you'll be billed $99/month.`
        : `Successfully upgraded to ${planToSet} plan!`,
    };
  } catch (error) {
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
  const navigate = useNavigate();
  const error = searchParams.get("error");

  useEffect(() => {
    if (data?.success && data?.isBeta) {
      const timer = setTimeout(() => navigate("/app"), 2500);
      return () => clearTimeout(timer);
    }
  }, [data, navigate]);

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
      <s-page heading={data.isBeta ? "Pro Trial Activated" : "Plan Activated"}>
        <s-section>
          <s-callout variant="success" title={data.isBeta ? "Pro Trial Activated!" : "Upgrade Successful!"}>
            <s-paragraph>
              <s-text variant="strong">{data.message}</s-text>
            </s-paragraph>
            <s-paragraph>
              {data.isBeta
                ? "Redirecting you to the dashboard…"
                : `Your plan has been updated and you now have access to all ${data.plan} plan features.`}
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

