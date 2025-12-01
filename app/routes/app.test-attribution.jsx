import React from "react";
import { useLoaderData, useSubmit, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { recordAttribution } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);
  
  return {
    shop,
    plan,
  };
};

export const action = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "test_attribution") {
    const orderId = formData.get("order_id") || `test_${Date.now()}`;
    const linkId = formData.get("link_id") || null;
    const channel = formData.get("channel") || null;
    const amount = parseFloat(formData.get("amount") || "99.99");
    const currency = formData.get("currency") || "USD";

    try {
      await recordAttribution({
        shopId: shop.id,
        orderId: orderId.toString(),
        linkId: linkId || null,
        channel: channel || null,
        amount: amount,
        currency: currency,
      });

      return {
        success: true,
        message: `Attribution recorded successfully! Order ID: ${orderId}`,
      };
    } catch (error) {
      console.error("Test attribution error:", error);
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  return { success: false, message: "Unknown action" };
};

export default function TestAttribution() {
  const { shop, plan } = useLoaderData();
  const submit = useSubmit();
  const actionData = useActionData();

  const handleTestSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    formData.append("intent", "test_attribution");
    
    submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Test Attribution">
      <s-section heading="Test Attribution Recording">
        <s-box padding="base" border="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text variant="bodyMd" tone="subdued">
              This page allows you to manually test attribution recording without creating actual orders.
              Use this to verify that attribution records appear in the Analytics page.
            </s-text>

            <s-callout variant="info" title="Testing Guide">
              <s-unordered-list>
                <s-list-item>
                  <s-text variant="strong">Test with link_id:</s-text> Enter a link_id to simulate an order from an Instagram link
                </s-list-item>
                <s-list-item>
                  <s-text variant="strong">Test without link_id:</s-text> Leave link_id empty to test edge case
                </s-list-item>
                <s-list-item>
                  <s-text variant="strong">Test channels:</s-text> Use "dm" or "comment" to test channel attribution
                </s-list-item>
                <s-list-item>
                  <s-text variant="strong">Verify:</s-text> Check the Analytics page to see if attribution records appear
                </s-list-item>
              </s-unordered-list>
            </s-callout>

            <form onSubmit={handleTestSubmit}>
              <s-stack direction="block" gap="base">
                <s-box padding="tight" border="base" borderRadius="base">
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="order_id">
                      <s-text variant="strong">Order ID</s-text>
                    </label>
                    <input
                      type="text"
                      id="order_id"
                      name="order_id"
                      placeholder="e.g., 123456789 or leave empty for auto-generated"
                      style={{
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        width: "100%",
                      }}
                    />
                  </s-stack>
                </s-box>

                <s-box padding="tight" border="base" borderRadius="base">
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="link_id">
                      <s-text variant="strong">Link ID (optional)</s-text>
                    </label>
                    <input
                      type="text"
                      id="link_id"
                      name="link_id"
                      placeholder="e.g., abc123xyz (leave empty to test missing link_id)"
                      style={{
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        width: "100%",
                      }}
                    />
                  </s-stack>
                </s-box>

                <s-box padding="tight" border="base" borderRadius="base">
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="channel">
                      <s-text variant="strong">Channel (optional)</s-text>
                    </label>
                    <select
                      id="channel"
                      name="channel"
                      style={{
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        width: "100%",
                      }}
                    >
                      <option value="">None</option>
                      <option value="dm">DM</option>
                      <option value="comment">Comment</option>
                    </select>
                  </s-stack>
                </s-box>

                <s-stack direction="inline" gap="base">
                  <s-box padding="tight" border="base" borderRadius="base" style={{ flex: "1" }}>
                    <s-stack direction="block" gap="tight">
                      <label htmlFor="amount">
                        <s-text variant="strong">Amount</s-text>
                      </label>
                      <input
                        type="number"
                        id="amount"
                        name="amount"
                        step="0.01"
                        defaultValue="99.99"
                        style={{
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                          width: "100%",
                        }}
                      />
                    </s-stack>
                  </s-box>

                  <s-box padding="tight" border="base" borderRadius="base" style={{ flex: "1" }}>
                    <s-stack direction="block" gap="tight">
                      <label htmlFor="currency">
                        <s-text variant="strong">Currency</s-text>
                      </label>
                      <input
                        type="text"
                        id="currency"
                        name="currency"
                        defaultValue="USD"
                        maxLength="3"
                        style={{
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                          width: "100%",
                        }}
                      />
                    </s-stack>
                  </s-box>
                </s-stack>

                <s-button type="submit" variant="primary">
                  Record Test Attribution
                </s-button>
              </s-stack>
            </form>

            {actionData && (
              <s-callout
                variant={actionData.success ? "success" : "critical"}
                title={actionData.success ? "Success" : "Error"}
              >
                <s-text>{actionData.message}</s-text>
              </s-callout>
            )}

            <s-box padding="base" border="base" borderRadius="base" style={{ marginTop: "16px" }}>
              <s-stack direction="block" gap="base">
                <s-text variant="headingMd">Quick Test Scenarios</s-text>
                <s-stack direction="block" gap="tight">
                  <s-text variant="bodyMd">
                    <s-text variant="strong">1. Test with link_id and channel:</s-text> Enter link_id "test_link_123", select channel "dm", and submit
                  </s-text>
                  <s-text variant="bodyMd">
                    <s-text variant="strong">2. Test without link_id:</s-text> Leave link_id empty, enter order_id "test_order_456", and submit
                  </s-text>
                  <s-text variant="bodyMd">
                    <s-text variant="strong">3. Test comment channel:</s-text> Enter link_id "test_link_789", select channel "comment", and submit
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Shop Info">
        <s-box padding="base" border="base" borderRadius="base">
          <s-stack direction="block" gap="tight">
            <s-paragraph>
              <s-text variant="strong">Shop ID:</s-text> {shop?.id || "N/A"}
            </s-paragraph>
            <s-paragraph>
              <s-text variant="strong">Shopify Domain:</s-text> {shop?.shopify_domain || "N/A"}
            </s-paragraph>
            <s-paragraph>
              <s-text variant="strong">Plan:</s-text> {plan?.name || "N/A"}
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Next Steps">
        <s-unordered-list>
          <s-list-item>
            Record a test attribution using the form above
          </s-list-item>
          <s-list-item>
            Navigate to the <s-link href="/app/analytics">Analytics page</s-link> to view attribution records
          </s-list-item>
          <s-list-item>
            Test filtering by channel, order ID, and date range
          </s-list-item>
          <s-list-item>
            For real order testing, create a checkout URL with <s-text variant="code">?ref=link_YOUR_LINK_ID&utm_medium=ig_dm</s-text> and complete an order (replace YOUR_LINK_ID with actual link_id)
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

