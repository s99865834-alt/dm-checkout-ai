import { useOutletContext, useLoaderData, useRouteError, useSearchParams, useFetcher } from "react-router";
import { useEffect, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { PLANS } from "../lib/plans";
import { getCurrentSubscription, getTrialStatus } from "../lib/billing.server";
import { managedPricingUrl } from "../lib/billing-url";
import { cached } from "../lib/loader-cache.server";

// The active-subscription lookup is a live Shopify GraphQL call — it made
// every visit to the Billing tab wait on Shopify. Subscriptions only change
// through our own plan actions, which invalidate this key (updateShopPlan),
// so a short cache is safe.
const SUBSCRIPTION_TTL_MS = 5 * 60 * 1000;

// Managed Pricing apps cannot call appSubscriptionCreate. Plan selection happens
// on Shopify's hosted pricing page; the merchant approves there and Shopify
// returns them to /app/billing/activate where we sync shop.plan from the
// active subscription. Any per-plan trial is a property of the plan itself
// in the Partner Dashboard and applies uniformly to every merchant who
// subscribes — there is no trial logic to maintain in this code.
//
// The URL is built in billing-url.js, which pins the app handle against
// shopify.app.toml. It was wrong here for the app's whole life.

export const loader = async ({ request }) => {
  // shop.plan is read straight from the DB. It's written authoritatively by:
  //   - /app/billing/activate (Managed Pricing return URL — uses the plan=
  //     query param Shopify appends after charge approval)
  //   - the app/subscriptions/update webhook (cancellations from Shopify admin)
  // We deliberately do NOT re-derive shop.plan from getCurrentSubscription
  // here. That race-conditions with both write paths above and was silently
  // reverting just-confirmed plan changes.
  const { shop, plan, admin } = await getShopWithPlan(request);

  let subscription = null;
  try {
    subscription = await cached(`subscription:${shop?.id}`, SUBSCRIPTION_TTL_MS, () =>
      getCurrentSubscription(admin),
    );
  } catch (e) {
    console.error("[billing] Error fetching subscription:", e.message);
  }

  return { shop, plan, subscription, trialStatus: getTrialStatus(subscription) };
};

export const action = async ({ request }) => {
  const { session, shop } = await getShopWithPlan(request);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const formData = await request.formData();
  const planName = formData.get("plan");

  if (planName !== "GROWTH" && planName !== "PRO") {
    throw new Response("Invalid plan", { status: 400 });
  }

  // Under Managed Pricing, plan selection happens on Shopify's hosted page;
  // we can't pre-select GROWTH vs PRO from here. The merchant picks on Shopify.
  const pricingUrl = managedPricingUrl(session.shop);
  if (!pricingUrl) {
    console.error(`[billing] No shop domain on session; cannot build pricing URL`);
    return { error: "Could not open the plan page. Please reload the app and try again." };
  }

  return { confirmationUrl: pricingUrl, planName };
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
  // Hooks must run unconditionally (`useOutletContext() || useLoaderData()`
  // skipped the second hook whenever context existed — a rules-of-hooks bug).
  const outletContext = useOutletContext();
  const loaderData = useLoaderData();
  const { shop, plan: currentPlan } = outletContext || loaderData;
  const { trialStatus } = loaderData;
  const currentPlanName = currentPlan?.name || "FREE";
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      window.open(fetcher.data.confirmationUrl, "_top");
    }
  }, [fetcher.data]);

  const plans = [
    {
      name: "GROWTH",
      label: "Basic",
      price: "$39",
      period: "month",
      config: PLANS.GROWTH,
      description: "Sell from comments and real conversations",
      badge: "Most popular",
      trialNote: "First 14 days free. Billing starts after your trial.",
      features: [
        "Comment-to-DM automation",
        "Multi-turn conversations",
        "Brand voice customization",
        "Custom reply language",
        "Checkout links and store question answering",
        "Order attribution + full analytics",
        "1,000 messages/month",
      ],
    },
    {
      name: "PRO",
      label: "Pro",
      price: "$99",
      period: "month",
      config: PLANS.PRO,
      description: "Sell from stories and follow up",
      trialNote: "First 14 days free. Billing starts after your trial.",
      features: [
        "Everything in Basic",
        "Story replies answered automatically",
        "Default product for stories and unmapped posts",
        "Follow-up messages",
        "Weekly customer insights: top questions, products asked about, what to post next",
        "Per-post analytics",
        "10,000 messages/month",
        "Priority support",
      ],
    },
  ];

  const planOrder = ["FREE", "GROWTH", "PRO"];
  const isCurrentPlan = (planName) => planName === currentPlanName;
  const canUpgrade = (planName) => planOrder.indexOf(planName) > planOrder.indexOf(currentPlanName);
  const freePlan = currentPlan?.freePlan;

  const compareRows = [
    ["Monthly Messages", "1,000", "10,000"],
    ["DM Automation", true, true],
    ["Checkout Links", true, true],
    ["Store Question Answering", true, true],
    ["Multi-language Replies", true, true],
    ["Comment-to-DM Automation", true, true],
    ["Multi-turn Conversations", true, true],
    ["Brand Voice", true, true],
    ["Custom Reply Language", true, true],
    ["Order Attribution + Full Analytics", true, true],
    ["Story Replies", false, true],
    ["Default Product", false, true],
    ["Follow-up Messages", false, true],
    ["Customer Insights (weekly)", false, true],
    ["Per-post Analytics", false, true],
    ["Priority Support", false, true],
  ];
  const cell = (v) => (v === true ? "✓" : v === false ? "-" : v);

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

      {currentPlan?.locked && (
        <s-section>
          <s-banner tone="warning" heading="Instagram replies are paused">
            <s-paragraph>
              Choose a plan to switch them back on. Your settings and post mappings are saved.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {freePlan?.inGrace && (
        <s-section>
          <s-banner tone="info" heading={`Free plan: ${freePlan.daysLeft} ${freePlan.daysLeft === 1 ? "day" : "days"} left`}>
            <s-paragraph>
              The Free plan is being retired. Choose Basic or Pro before it ends to keep replies running.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {trialStatus && (
        <s-section>
          <s-banner tone={trialStatus.daysLeft <= 3 ? "warning" : "success"}>
            <s-text variant="strong">
              Free trial: {trialStatus.daysLeft} {trialStatus.daysLeft === 1 ? "day" : "days"} left
            </s-text>
            <s-text>
              {" "}Your first charge is on{" "}
              {new Date(trialStatus.trialEndsAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
              Cancel anytime before then and you won't be billed.
            </s-text>
          </s-banner>
        </s-section>
      )}

      <s-section>
        <div className="srPlanGrid">
          {plans.map((plan) => {
            const isCurrent = isCurrentPlan(plan.name);
            const upgrade = canUpgrade(plan.name);

            return (
              <div key={plan.name} className={`srBillPlanCard${isCurrent ? " srBillPlanCardCurrent" : ""}`}>
                <div className="srBillPlanHead">
                  <span className="srBillPlanName">{plan.label}</span>
                  {isCurrent && (
                    <s-badge tone="success">Current Plan</s-badge>
                  )}
                  {plan.badge && !isCurrent && (
                    <s-badge tone="info">{plan.badge}</s-badge>
                  )}
                </div>

                <div className="srBillPlanPrice">
                  {plan.price}
                  <span className="srBillPlanPeriod">/{plan.period}</span>
                </div>

                {plan.trialNote && !isCurrent && (
                  <span className="srBillPlanTrial">{plan.trialNote}</span>
                )}

                <span className="srBillPlanDesc">{plan.description}</span>

                <ul className="srBillPlanFeatures">
                  {plan.features.map((feature, idx) => (
                    <li key={idx}>{feature}</li>
                  ))}
                </ul>

                <div className="srBillPlanAction">
                  {isCurrent ? (
                    <button className="srPrimaryBtn" disabled style={{ opacity: 0.5, cursor: "default" }}>
                      Current Plan
                    </button>
                  ) : (
                    <PlanActionButton
                      fetcher={fetcher}
                      planName={plan.name}
                      variant={upgrade ? "primary" : "secondary"}
                      label={upgrade ? `Choose ${plan.label}` : `Switch to ${plan.label}`}
                    />
                  )}
                </div>
              </div>
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
          <div className="srTableWrap srCompareWrap">
          <table className="srTable">
            <thead>
              <tr>
                <th className="srTh srTextLeft">Feature</th>
                <th className="srTh srTextCenter">Basic</th>
                <th className="srTh srTextCenter">Pro</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map(([feature, basic, pro]) => (
                <tr key={feature}>
                  <td><span className="srTextStrong">{feature}</span></td>
                  <td className="srTextCenter">{cell(basic)}</td>
                  <td className="srTextCenter">{cell(pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
