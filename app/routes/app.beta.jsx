import { useEffect } from "react";
import { useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { validateBetaCode, getBetaTrialStatus } from "../lib/db.server";
import { createChargeViaAPI } from "../lib/billing.server";

export const loader = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const url = new URL(request.url);
  const code = url.searchParams.get("beta_code");
  const betaStatus = await getBetaTrialStatus(shop.id);

  return { code: code || null, betaStatus };
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
  const { code, betaStatus } = useLoaderData();
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      window.open(fetcher.data.confirmationUrl, "_blank");
    }
  }, [fetcher.data]);

  return (
    <s-page heading="Beta Trial">
      {betaStatus?.active && (
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
                {betaStatus.daysRemaining !== 1 ? "s" : ""} remaining in your
                free trial. After the trial, you'll be charged $99/month for the
                PRO plan.
              </s-paragraph>
            </s-stack>
          </s-callout>
        </s-section>
      )}

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
          <s-callout variant="info" title="Approve Your Trial">
            <s-paragraph>
              A new window should have opened for you to approve the 60-day free
              trial. After the trial, billing starts at $99/month for the PRO
              plan. You can cancel anytime.
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      {!betaStatus?.active && !fetcher.data?.confirmationUrl && (
        <s-section heading="Activate Your Beta Trial">
          <s-card>
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Enter your beta invitation code to start a{" "}
                <s-text variant="strong">free 60-day PRO trial</s-text>. After
                the trial period, you'll be billed $99/month. You can cancel
                anytime before the trial ends.
              </s-paragraph>
              <fetcher.Form method="post">
                <s-stack direction="block" gap="base">
                  <s-text-field
                    label="Beta Code"
                    name="code"
                    placeholder="BETA-XXXX-XXXX"
                    value={code || ""}
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

      <s-section heading="What's Included">
        <s-card>
          <s-stack direction="block" gap="tight">
            <s-paragraph>
              Your beta trial includes all PRO plan features:
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>50,000 messages per month</s-list-item>
              <s-list-item>DM + Comments automation</s-list-item>
              <s-list-item>Conversational AI</s-list-item>
              <s-list-item>Brand voice customization</s-list-item>
              <s-list-item>Follow-up automation</s-list-item>
              <s-list-item>Priority support</s-list-item>
            </s-unordered-list>
            <s-paragraph tone="subdued">
              60 days free, then $99/month. Cancel anytime.
            </s-paragraph>
          </s-stack>
        </s-card>
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
