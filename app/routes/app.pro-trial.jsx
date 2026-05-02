import { useEffect, useRef, useState } from "react";
import { useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getBetaTrialStatus, validateAndRedeemBetaCode } from "../lib/db.server";

// Managed Pricing apps cannot apply per-merchant trialDays via the Billing API,
// so we grant the trial entitlement directly in our DB. PRO features are gated
// on beta_trial_expires_at throughout the app, so no Shopify charge is needed
// during the trial. After it ends, the merchant subscribes to PRO via Shopify's
// hosted pricing page to keep PRO access.

export const loader = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const betaStatus = await getBetaTrialStatus(shop.id);
  return { betaStatus };
};

export const action = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const code = formData.get("code");

  const result = await validateAndRedeemBetaCode(shop.id, code);
  if (!result.success) {
    return { error: result.message };
  }

  return { redeemed: true, trialExpiresAt: result.trialExpiresAt };
};

export default function BetaRedeem() {
  const { betaStatus } = useLoaderData();
  const fetcher = useFetcher();
  const formRef = useRef(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (fetcher.data?.redeemed) {
      // Reload so the loader picks up the now-active beta_trial_expires_at
      // and renders the success state below.
      window.location.reload();
    }
  }, [fetcher.data]);

  if (betaStatus?.active) {
    return (
      <s-page heading="Pro Trial">
        <s-section>
          <s-callout variant="success" title="Pro Trial Active">
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                You have full <s-text variant="strong">Pro plan</s-text> access
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
                the trial ends, subscribe to the Pro plan from the Billing page
                to keep Pro features. You won't be charged during the trial.
              </s-paragraph>
              <s-button href="/app" variant="primary">Go to Dashboard</s-button>
            </s-stack>
          </s-callout>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Pro Trial">
      {fetcher.data?.error && (
        <s-section>
          <s-callout variant="critical" title="Error">
            <s-paragraph>
              <s-text>{fetcher.data.error}</s-text>
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      <s-section>
        <s-card>
          <s-stack direction="block" gap="base">
            <s-heading level="2">Enter your trial code</s-heading>
            <s-paragraph tone="subdued">
              Your free trial includes all Pro plan features. You won't be
              charged during the trial. After it ends, subscribe to the Pro
              plan from the Billing page to keep Pro features.
            </s-paragraph>
            <fetcher.Form method="post" ref={formRef}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label className="srFieldLabel">
                  <span className="srCardTitle">Trial Code</span>
                  <input
                    type="text"
                    name="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX-XXXX"
                    required
                    className="srInput"
                    style={{ fontFamily: "monospace", letterSpacing: "1px" }}
                  />
                </label>
                <button
                  type="button"
                  className="srPrimaryBtn"
                  disabled={!code.trim() || fetcher.state === "submitting"}
                  onClick={() => {
                    if (formRef.current && code.trim()) {
                      fetcher.submit(formRef.current);
                    }
                  }}
                >
                  {fetcher.state === "submitting" ? "Activating…" : "Start Free Trial"}
                </button>
              </div>
            </fetcher.Form>
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
