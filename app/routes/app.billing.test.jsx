import { useLoaderData, Form, redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { updateShopPlan } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);
  return { shop, plan };
};

export const action = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const formData = await request.formData();
  const planName = formData.get("plan");

  if (!planName || (planName !== "FREE" && planName !== "GROWTH" && planName !== "PRO")) {
    return { error: "Invalid plan" };
  }

  try {
    await updateShopPlan(shop.id, planName);
    return redirect("/app/billing/select?success=Plan updated successfully");
  } catch (error) {
    console.error("Error updating plan:", error);
    return { error: error.message };
  }
};

export default function BillingTest() {
  const { shop, plan } = useLoaderData();

  return (
    <s-page heading="Test Plan Update (Dev Only)">
      <s-section>
        <s-callout variant="warning" title="Development Tool">
          <s-paragraph>
            This page is for testing plan updates without going through the billing flow.
            <s-text variant="strong"> Remove this route before production!</s-text>
          </s-paragraph>
        </s-callout>
      </s-section>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text variant="strong">Current Plan:</s-text> {plan?.name || "Unknown"}
          </s-paragraph>
          <s-paragraph>
            <s-text variant="strong">Shop ID:</s-text> {shop?.id || "Unknown"}
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Update Plan (Testing Only)">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text>Click a button to update the plan:</s-text>
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <Form method="post">
              <input type="hidden" name="plan" value="FREE" />
              <s-button type="submit" variant="secondary">
                Set to FREE
              </s-button>
            </Form>
            <Form method="post">
              <input type="hidden" name="plan" value="GROWTH" />
              <s-button type="submit" variant="primary">
                Set to GROWTH
              </s-button>
            </Form>
            <Form method="post">
              <input type="hidden" name="plan" value="PRO" />
              <s-button type="submit" variant="primary">
                Set to PRO
              </s-button>
            </Form>
          </s-stack>
        </s-stack>
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

