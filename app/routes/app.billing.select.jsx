import { useOutletContext, useLoaderData, useRouteError, useSearchParams, useFetcher } from "react-router";
import { useEffect, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { PLANS } from "../lib/plans";
import { createChargeViaAPI, getCurrentSubscription, cancelCurrentSubscription } from "../lib/billing.server";
import { updateShopPlan } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { shop, plan, admin } = await getShopWithPlan(request);
  let subscription = null;
  try {
    subscription = await getCurrentSubscription(admin);
  } catch (e) {
    console.error("[billing] Error fetching subscription:", e.message);
  }
  return { shop, plan, subscription };
};

export const action = async ({ request }) => {
  const { admin, session, shop } = await getShopWithPlan(request);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const formData = await request.formData();
  const planName = formData.get("plan");

  if (!planName || (planName !== "FREE" && planName !== "GROWTH" && planName !== "PRO")) {
    throw new Response("Invalid plan", { status: 400 });
  }

  // Downgrade to FREE: cancel the active Shopify subscription via Billing API
  // so the merchant is no longer charged. No external redirect required.
  if (planName === "FREE") {
    try {
      await cancelCurrentSubscription(admin);
      await updateShopPlan(shop.id, "FREE");
      return { downgraded: true, planName: "FREE" };
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      return { error: error.message };
    }
  }

  const storeHandle = session.shop.replace(".myshopify.com", "");
  const returnUrl = `https://admin.shopify.com/store/${storeHandle}/apps/dm-checkout-ai/app/billing/activate?plan=${planName}`;

  try {
    const { confirmationUrl } = await createChargeViaAPI(admin, planName, returnUrl);
    return { confirmationUrl, planName };
  } catch (error) {
    console.error("Error creating charge:", error);
    return { error: error.message };
  }
};

function PlanActionButton({ fetcher, planName, variant, label }) {
  const formRef = useRef(null);
  const isPrimary = variant === "primary";
  return (
    <fetcher.Form method="post" ref={formRef}>
      <input type="hidden" name="plan" value={planName} />
      <button
        type="button"
        className={isPrimary ? "srPrimaryBtn" : "srSecondaryBtn"}
        disabled={fetcher.state === "submitting"}
        onClick={() => formRef.current && fetcher.submit(formRef.current)}
      >
        {fetcher.state === "submitting" ? "Processing…" : label}
      </button>
    </fetcher.Form>
  );
}

export default function BillingSelect() {
  const { shop, plan: currentPlan } = useOutletContext() || useLoaderData();
  const { subscription } = useLoaderData();
  const currentPlanName = currentPlan?.name || "FREE";
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      window.open(fetcher.data.confirmationUrl, "_top");
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.data?.downgraded) {
      // Refresh so the Current Plan badge updates to FREE.
      window.location.reload();
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
        "100 messages/month",
        "DM automation with AI",
        "Checkout links",
        "Basic analytics",
      ],
    },
    {
      name: "GROWTH",
      price: "$39",
      period: "month",
      config: PLANS.GROWTH,
      description: "Scale your Instagram sales",
      badge: "Popular",
      features: [
        "500 messages/month",
        "DMs + Comment-to-DM",
        "Brand voice customization",
        "Store question answering",
        "Order attribution + full analytics",
      ],
    },
    {
      name: "PRO",
      price: "$99",
      period: "month",
      config: PLANS.PRO,
      description: "Maximum growth & insights",
      features: [
        "10,000 messages/month",
        "Everything in Growth",
        "Follow-up messages",
        "Multi-turn conversations",
        "Per-post analytics",
        "Priority support",
      ],
    },
  ];

  const planOrder = ["FREE", "GROWTH", "PRO"];
  const isCurrentPlan = (planName) => planName === currentPlanName;
  const canUpgrade = (planName) => planOrder.indexOf(planName) > planOrder.indexOf(currentPlanName);
  const canDowngrade = (planName) => planOrder.indexOf(planName) < planOrder.indexOf(currentPlanName);

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
          <s-callout variant="info" title="Processing...">
            <s-paragraph>
              <s-text>Please wait while we set up your new plan...</s-text>
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      <s-section>
        <div className="srPlanGrid">
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
                    {plan.badge && !isCurrent && (
                      <s-badge tone="info">{plan.badge}</s-badge>
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
                    <s-heading level="3">Includes:</s-heading>
                    <s-unordered-list>
                      {plan.features.map((feature, idx) => (
                        <s-list-item key={idx}>{feature}</s-list-item>
                      ))}
                    </s-unordered-list>
                  </s-stack>

                  <div>
                    {isCurrent ? (
                      <button className="srPrimaryBtn" disabled style={{ opacity: 0.5, cursor: "default" }}>
                        Current Plan
                      </button>
                    ) : upgrade ? (
                      <PlanActionButton fetcher={fetcher} planName={plan.name} variant="primary" label={`Upgrade to ${plan.name}`} />
                    ) : downgrade && plan.name === "FREE" ? (
                      <PlanActionButton fetcher={fetcher} planName="FREE" variant="secondary" label="Switch to Free" />
                    ) : downgrade ? (
                      <PlanActionButton fetcher={fetcher} planName={plan.name} variant="secondary" label={`Switch to ${plan.name}`} />
                    ) : null}
                  </div>
                </s-stack>
              </s-card>
            );
          })}
        </div>
      </s-section>

      {currentPlanName !== "FREE" && (
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <div className="srHStack" style={{ gap: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <span className="srCardTitle">Manage subscription</span>
                <span className="srCardDesc" style={{ display: "block", marginTop: "4px" }}>
                  To cancel your subscription or view billing history, visit your Shopify admin.
                </span>
              </div>
              <button
                type="button"
                className="srSecondaryBtn"
                onClick={() => {
                  const handle = shop?.shopify_domain?.replace(".myshopify.com", "");
                  window.open(
                    `https://admin.shopify.com/store/${handle}/settings/billing`,
                    "_top"
                  );
                }}
              >
                Billing settings
              </button>
            </div>
          </s-box>
        </s-section>
      )}

      <s-section heading="Feature Comparison">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <table className="srTable">
            <thead>
              <tr>
                <th className="srTh srTextLeft">Feature</th>
                <th className="srTh srTextCenter">Free</th>
                <th className="srTh srTextCenter">Growth</th>
                <th className="srTh srTextCenter">Pro</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="srTextStrong">Monthly Messages</span></td>
                <td className="srTextCenter">100</td>
                <td className="srTextCenter">500</td>
                <td className="srTextCenter">10,000</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">DM Automation</span></td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Checkout Links</span></td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Basic Analytics</span></td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Comment-to-DM Automation</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Brand Voice</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Store Question Answering</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Order Attribution + Full Analytics</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Follow-up Messages</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Multi-turn Conversations</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Per-post Analytics</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
              </tr>
              <tr>
                <td><span className="srTextStrong">Priority Support</span></td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">—</td>
                <td className="srTextCenter">✓</td>
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
