import { useEffect } from "react";
import { useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { validateBetaCode, getBetaTrialStatus } from "../lib/db.server";
import { createChargeViaAPI } from "../lib/billing.server";

export const loader = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const betaStatus = await getBetaTrialStatus(shop.id);
  return { betaStatus };
};

export const action = async ({ request }) => {
  const { shop, admin } = await getShopWithPlan(request);
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const code = formData.get("code");

  const validation = await validateBetaCode(shop.id, code);
  if (!validation.success) {
    return { error: validation.message };
  }

  const url = new URL(request.url);
  const returnUrl = `${url.origin}/app/billing/activate?plan=PRO&beta_code=${encodeURIComponent(code.trim().toUpperCase())}`;

  try {
    const { confirmationUrl } = await createChargeViaAPI(admin, "PRO", returnUrl, {
      trialDays: validation.trialDays,
    });
    return { confirmationUrl };
  } catch (err) {
    console.error("Beta charge creation error:", err);
    return { error: err.message || "Failed to create subscription. Please try again." };
  }
};

export default function BetaRedeem() {
  const { betaStatus } = useLoaderData();
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      window.open(fetcher.data.confirmationUrl, "_blank");
    }
  }, [fetcher.data]);

  if (betaStatus?.active) {
    return (
      <s-page heading="Beta Trial">
        <s-section>
          <s-callout variant="success" title="Beta Trial Active">
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                You have full <s-text variant="strong">PRO plan</s-text> access
                until{" "}
                <s-text variant="strong">
                  {new Date(betaStatus.expiresAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </s-text>
                .
              </s-paragraph>
              <s-paragraph tone="subdued">
                {betaStatus.daysRemaining} day
                {betaStatus.daysRemaining !== 1 ? "s" : ""} remaining. After
                the trial you will be billed $99/month for the PRO plan. You can
                cancel anytime before the trial ends.
              </s-paragraph>
            </s-stack>
          </s-callout>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Beta Trial">
      {fetcher.data?.error && (
        <s-section>
          <s-callout variant="critical" title="Error">
            <s-paragraph>
              <s-text>{fetcher.data.error}</s-text>
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      {fetcher.data?.confirmationUrl && (
        <s-section>
          <s-callout variant="info" title="Approve Your Free Trial">
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                A new window should have opened for you to confirm the 60-day
                free trial.
              </s-paragraph>
              <s-paragraph tone="subdued">
                You will not be charged during the trial. After 60 days your
                plan will automatically convert to PRO at $99/month. You can
                cancel anytime before the trial ends to avoid being charged.
              </s-paragraph>
            </s-stack>
          </s-callout>
        </s-section>
      )}

      {!fetcher.data?.confirmationUrl && (
        <s-section>
          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading level="2">Enter your beta code</s-heading>
              <s-paragraph tone="subdued">
                Your 60-day free trial includes all PRO plan features. After the
                trial you will be billed $99/month. Cancel anytime.
              </s-paragraph>
              <fetcher.Form method="post">
                <s-stack direction="block" gap="base">
                  <s-text-field
                    label="Beta Code"
                    name="code"
                    placeholder="BETA-XXXX-XXXX"
                    required
                  />
                  <s-button
                    variant="primary"
                    type="submit"
                    loading={fetcher.state === "submitting"}
                  >
                    Start Free Trial
                  </s-button>
                </s-stack>
              </fetcher.Form>
            </s-stack>
          </s-card>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
