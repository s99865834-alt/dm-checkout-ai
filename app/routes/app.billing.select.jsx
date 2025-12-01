import { useOutletContext, useLoaderData, useRouteError, redirect, Form, useSearchParams, useFetcher } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { PLANS } from "../lib/plans";
import { createChargeViaAPI } from "../lib/billing.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);
  return { shop, plan };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = await getShopWithPlan(request);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const formData = await request.formData();
  const planName = formData.get("plan");

  if (!planName || (planName !== "GROWTH" && planName !== "PRO")) {
    throw new Response("Invalid plan", { status: 400 });
  }

  // Build return URL for billing confirmation
  const url = new URL(request.url);
  const returnUrl = `${url.origin}/app/billing/activate?plan=${planName}`;

  try {
    // Create the recurring charge
    const { confirmationUrl } = await createChargeViaAPI(admin, planName, returnUrl);

    // Return the confirmation URL to the client
    // The client will handle the redirect using App Bridge
    return { confirmationUrl, planName };
  } catch (error) {
    console.error("Error creating charge:", error);
    // Return error to client
    return { error: error.message };
  }
};

export default function BillingSelect() {
  const { shop, plan: currentPlan } = useOutletContext() || useLoaderData();
  const currentPlanName = currentPlan?.name || "FREE";
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const fetcher = useFetcher();

  // Handle redirect when confirmation URL is received
  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      // Open confirmation URL in a new window for billing approval
      // This is the recommended approach for billing confirmations in embedded apps
      window.open(fetcher.data.confirmationUrl, "_blank");
    }
  }, [fetcher.data]);

  const plans = [
    {
      name: "FREE",
      price: "$0",
      period: "month",
      config: PLANS.FREE,
      description: "Perfect for getting started",
      features: [
        "25 messages/month",
        "DM automation",
        "Basic AI responses",
      ],
    },
    {
      name: "GROWTH",
      price: "$29",
      period: "month",
      config: PLANS.GROWTH,
      description: "Scale your Instagram sales",
      features: [
        "500 messages/month",
        "DM + Comments automation",
        "Conversational AI",
        "Brand voice customization",
      ],
    },
    {
      name: "PRO",
      price: "$99",
      period: "month",
      config: PLANS.PRO,
      description: "Enterprise-level features",
      features: [
        "50,000 messages/month",
        "All Growth features",
        "Follow-up automation",
        "Remarketing tools",
        "Priority support",
      ],
    },
  ];

  const getPlanBadgeTone = (planName) => {
    if (planName === "FREE") return "subdued";
    if (planName === "GROWTH") return "info";
    if (planName === "PRO") return "success";
    return "subdued";
  };

  const isCurrentPlan = (planName) => planName === currentPlanName;
  const canUpgrade = (planName) => {
    const planOrder = ["FREE", "GROWTH", "PRO"];
    return planOrder.indexOf(planName) > planOrder.indexOf(currentPlanName);
  };
  const canDowngrade = (planName) => {
    const planOrder = ["FREE", "GROWTH", "PRO"];
    return planOrder.indexOf(planName) < planOrder.indexOf(currentPlanName);
  };

  return (
    <s-page heading="Choose Your Plan">
      {(error || fetcher.data?.error) && (
        <s-section>
          <s-callout variant="critical" title="Error">
            <s-paragraph>
              <s-text>{error || fetcher.data?.error}</s-text>
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      {fetcher.state === "submitting" && (
        <s-section>
          <s-callout variant="info" title="Creating charge...">
            <s-paragraph>
              <s-text>Please wait while we create your billing charge...</s-text>
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      {currentPlanName && (
        <s-section>
          <s-callout variant="info" title={`Current Plan: ${currentPlanName}`}>
            <s-paragraph>
              You're currently on the <s-text variant="strong">{currentPlanName}</s-text> plan.
              {currentPlanName !== "PRO" && " Upgrade to unlock more features!"}
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      <s-section>
        <s-stack direction="block" gap="large">
          {plans.map((plan) => {
            const isCurrent = isCurrentPlan(plan.name);
            const upgrade = canUpgrade(plan.name);
            const downgrade = canDowngrade(plan.name);

            return (
              <s-card key={plan.name}>
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="center">
                    <s-heading level="2">{plan.name}</s-heading>
                    {isCurrent && (
                      <s-badge tone="success">Current Plan</s-badge>
                    )}
                  </s-stack>

                  <s-stack direction="inline" gap="tight" alignment="baseline">
                    <s-text variant="heading2xl" as="span">
                      {plan.price}
                    </s-text>
                    <s-text variant="bodyMd" as="span" tone="subdued">
                      /{plan.period}
                    </s-text>
                  </s-stack>

                  <s-paragraph tone="subdued">{plan.description}</s-paragraph>

                  <s-stack direction="block" gap="tight">
                    <s-heading level="3">Features:</s-heading>
                    <s-unordered-list>
                      {plan.features.map((feature, idx) => (
                        <s-list-item key={idx}>{feature}</s-list-item>
                      ))}
                    </s-unordered-list>
                  </s-stack>

                  <s-stack direction="block" gap="tight">
                    {isCurrent ? (
                      <s-button variant="primary" disabled>
                        Current Plan
                      </s-button>
                    ) : upgrade ? (
                      <fetcher.Form method="post">
                        <input type="hidden" name="plan" value={plan.name} />
                        <s-button 
                          variant="primary" 
                          type="submit"
                          loading={fetcher.state === "submitting"}
                        >
                          Upgrade to {plan.name}
                        </s-button>
                      </fetcher.Form>
                    ) : downgrade ? (
                      <s-button variant="secondary" disabled>
                        Downgrade (Coming Soon)
                      </s-button>
                    ) : null}
                  </s-stack>
                </s-stack>
              </s-card>
            );
          })}
        </s-stack>
      </s-section>

      <s-section heading="Feature Comparison">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>
                  Feature
                </th>
                <th style={{ textAlign: "center", padding: "12px", fontWeight: "600" }}>
                  Free
                </th>
                <th style={{ textAlign: "center", padding: "12px", fontWeight: "600" }}>
                  Growth
                </th>
                <th style={{ textAlign: "center", padding: "12px", fontWeight: "600" }}>
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">Monthly Messages</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>25</td>
                <td style={{ textAlign: "center", padding: "12px" }}>500</td>
                <td style={{ textAlign: "center", padding: "12px" }}>50,000</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">DM Automation</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">Comments Automation</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">Conversations</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">Brand Voice</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">Follow-ups</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">Remarketing</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
              </tr>
              <tr>
                <td style={{ padding: "12px" }}>
                  <s-text variant="strong">Priority Support</s-text>
                </td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>—</td>
                <td style={{ textAlign: "center", padding: "12px" }}>✓</td>
              </tr>
            </tbody>
          </table>
        </s-box>
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

