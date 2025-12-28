import { useEffect } from "react";
import { useFetcher, useOutletContext } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";

export const loader = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);
  
  return {};
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();

  return {
    product: responseJson.data.productCreate.product,
    variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const { shop, plan } = useOutletContext() || {};
  const { hasAccess } = usePlanAccess();
  
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const productId = fetcher.data?.product?.id.replace(
    "gid://shopify/Product/",
    "",
  );

  useEffect(() => {
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [productId, shopify]);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="DM Checkout AI">
      {shop && plan && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
              {plan.name} Plan
            </s-badge>
            {plan.name === "FREE" && shop.usage_count !== undefined && (
              <s-text variant="subdued">
                Usage: {shop.usage_count}/{plan.cap} messages this month
              </s-text>
            )}
          </s-stack>
        </s-section>
      )}
      <s-button slot="primary-action" onClick={generateProduct}>
        Generate a product
      </s-button>




     

      {/* Example of plan-aware gating */}
      <s-section heading="Plan Features">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text variant="strong">Available Features:</s-text>
          </s-paragraph>
          <s-unordered-list>
            <s-list-item>
              DM Automation: {plan?.dm ? "✅ Enabled" : "❌ Disabled"}
            </s-list-item>
            <s-list-item>
              Comments Automation: {plan?.comments ? "✅ Enabled" : "❌ Disabled"}
            </s-list-item>
            <s-list-item>
              Conversations: {plan?.converse ? "✅ Enabled" : "❌ Disabled"}
            </s-list-item>
            <s-list-item>
              Brand Voice: {plan?.brandVoice ? "✅ Enabled" : "❌ Disabled"}
            </s-list-item>
            <s-list-item>
              Follow-ups: {plan?.followup ? "✅ Enabled" : "❌ Disabled"}
            </s-list-item>
          </s-unordered-list>

          {/* Example: Locked feature for Growth+ */}
          <PlanGate requiredPlan="GROWTH" feature="Comments Automation">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-paragraph>
                <s-text variant="strong">Comments Automation</s-text>
              </s-paragraph>
              <s-paragraph>
                This feature is available! You can automate responses to Instagram comments.
              </s-paragraph>
            </s-box>
          </PlanGate>

          {/* Example: Locked feature for Pro */}
          <PlanGate requiredPlan="PRO" feature="Follow-up Messages">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-paragraph>
                <s-text variant="strong">Follow-up Messages</s-text>
              </s-paragraph>
              <s-paragraph>
                This feature is available! Automatically follow up with customers who haven't responded.
              </s-paragraph>
            </s-box>
          </PlanGate>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
