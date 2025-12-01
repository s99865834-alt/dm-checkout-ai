import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  
  return {
    shop,
    plan,
    timestamp: new Date().toISOString(),
  };
};

export default function TestShop() {
  const { shop, plan, timestamp } = useLoaderData();

  return (
    <s-page heading="Shop & Plan Test">
      <s-section heading="Shop Data">
        {shop ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-heading level="3">Shop Found in Database ✅</s-heading>
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text variant="strong">Shop ID:</s-text> {shop.id}
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">Shopify Domain:</s-text> {shop.shopify_domain}
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">Plan:</s-text> {shop.plan}
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">Monthly Cap:</s-text> {shop.monthly_cap}
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">Usage Count:</s-text> {shop.usage_count || 0}
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">Active:</s-text> {shop.active ? "✅ Yes" : "❌ No"}
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">Created At:</s-text> {new Date(shop.created_at).toLocaleString()}
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-callout variant="warning" title="Shop Not Found in Database">
            <s-paragraph>
              The shop has not been created in the database yet. This should happen automatically during OAuth.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                If you just installed the app, check:
              </s-text>
            </s-paragraph>
            <s-unordered-list>
              <s-list-item>Check server logs for "Shop created/updated in database" message</s-list-item>
              <s-list-item>Verify Supabase connection is working</s-list-item>
              <s-list-item>Try refreshing this page</s-list-item>
            </s-unordered-list>
          </s-callout>
        )}
      </s-section>

      <s-section heading="Plan Configuration">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <s-heading level="3">Plan: {plan.name}</s-heading>
          <s-unordered-list>
            <s-list-item>
              <s-text variant="strong">Monthly Cap:</s-text> {plan.cap}
            </s-list-item>
            <s-list-item>
              <s-text variant="strong">DM Enabled:</s-text> {plan.dm ? "✅ Yes" : "❌ No"}
            </s-list-item>
            <s-list-item>
              <s-text variant="strong">Comments Enabled:</s-text> {plan.comments ? "✅ Yes" : "❌ No"}
            </s-list-item>
            <s-list-item>
              <s-text variant="strong">Conversations:</s-text> {plan.converse ? "✅ Yes" : "❌ No"}
            </s-list-item>
            <s-list-item>
              <s-text variant="strong">Brand Voice:</s-text> {plan.brandVoice ? "✅ Yes" : "❌ No"}
            </s-list-item>
            <s-list-item>
              <s-text variant="strong">Follow-up:</s-text> {plan.followup ? "✅ Yes" : "❌ No"}
            </s-list-item>
            <s-list-item>
              <s-text variant="strong">Remarketing:</s-text> {plan.remarketing ? "✅ Yes" : "❌ No"}
            </s-list-item>
            <s-list-item>
              <s-text variant="strong">Priority Support:</s-text> {plan.prioritySupport ? "✅ Yes" : "❌ No"}
            </s-list-item>
          </s-unordered-list>
        </s-box>
      </s-section>

      <s-section heading="Test Info">
        <s-paragraph>
          <s-text variant="subdued">Test executed at: {timestamp}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text variant="subdued">
            This page verifies that:
          </s-text>
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>Shop was created in Supabase during OAuth</s-list-item>
          <s-list-item>Shop has correct default values (FREE plan, cap 25)</s-list-item>
          <s-list-item>Plan configuration is loaded correctly</s-list-item>
          <s-list-item>Loader helper is working</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

