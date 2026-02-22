import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth, getInstagramAccountInfo } from "../lib/meta.server";

const APP_URL = process.env.APP_URL || process.env.SHOPIFY_APP_URL || "https://dm-checkout-ai-production.up.railway.app";
const WEBHOOK_CALLBACK_URL = `${APP_URL.replace(/\/$/, "")}/webhooks/meta`;

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);

  let metaAuth = null;
  let instagramInfo = null;

  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);
    if (metaAuth?.ig_business_id) {
      try {
        instagramInfo = await getInstagramAccountInfo(metaAuth.ig_business_id, shop.id);
      } catch (e) {
        console.error("[setup] Error fetching Instagram info:", e);
      }
    }
  }

  return {
    shop,
    plan,
    metaAuth,
    instagramInfo,
    webhookCallbackUrl: WEBHOOK_CALLBACK_URL,
  };
};

export default function SetupPage() {
  const { shop, plan, metaAuth, instagramInfo, webhookCallbackUrl } = useLoaderData();
  const isConnected = !!metaAuth;

  return (
    <s-page heading="Setup Guide">
      <s-section>
        <s-callout variant="info" title="Getting Started">
          <s-paragraph>
            Two steps: connect your Instagram account here, then add our webhook URL once in the Meta for Developers dashboard. After that, the app receives DMs and comments automatically.
          </s-paragraph>
        </s-callout>
      </s-section>

      {/* Step 1: Connect Instagram */}
      <s-section heading="Step 1: Connect Instagram">
        {isConnected ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="success">
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                <s-text variant="strong" tone="success">✅ Instagram connected</s-text>
              </s-paragraph>
              {instagramInfo && (
                <s-paragraph>
                  <s-text variant="subdued">
                    Account: @{instagramInfo.username || "Instagram professional account"}
                  </s-text>
                </s-paragraph>
              )}
            </s-stack>
          </s-box>
        ) : (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Connect your Instagram Business or Creator account so the app can reply to DMs and comments.
              </s-paragraph>
              <s-button
                variant="primary"
                onClick={() => {
                  window.location.href = "/app";
                }}
              >
                Connect Instagram
              </s-button>
            </s-stack>
          </s-box>
        )}
      </s-section>

      {/* Step 2: Webhook in Meta App Dashboard */}
      <s-section heading="Step 2: Add webhook in Meta for Developers">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text variant="subdued">
                Instagram sends new messages and comments to our app using a webhook. You add this URL once in your Meta app so Meta knows where to send events.
              </s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="strong">Where to do it</s-text>
            </s-paragraph>
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                <s-text variant="subdued">1. Go to <s-link href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer">developers.facebook.com</s-link> and open your app.</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">2. In the left menu: <s-text variant="strong">Instagram</s-text> → <s-text variant="strong">Webhooks</s-text> (under “Instagram” product).</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">3. Click <s-text variant="strong">Add subscription</s-text> or edit the existing one.</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">4. Set <s-text variant="strong">Callback URL</s-text> to:</s-text>
              </s-paragraph>
              <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                <s-text variant="subdued" className="srPreWrap srMonoPre">{webhookCallbackUrl}</s-text>
              </s-box>
              <s-paragraph>
                <s-text variant="subdued">5. Set <s-text variant="strong">Verify token</s-text> to the same value as in your app’s environment (<code>META_WEBHOOK_VERIFY_TOKEN</code>). Meta will send this when it verifies the URL.</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">6. Subscribe to <s-text variant="strong">messages</s-text> and <s-text variant="strong">comments</s-text> so the app receives DMs and comment events.</s-text>
              </s-paragraph>
            </s-stack>
            <s-paragraph>
              <s-text variant="subdued">
                You only need to do this once per app. If your app is in Development mode, webhooks still work for your test users.
              </s-text>
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-section>

      {/* Step 3: Checklist */}
      {isConnected && (
        <s-section heading="Step 3: You’re set">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="success-subdued">
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                <s-text>✅ Instagram connected</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>✅ Add the webhook URL in Meta for Developers (Step 2) if you haven’t yet</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">
                  After that, the app will receive DMs and comments and can send automated replies (within your plan limits).
                </s-text>
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* What happens next */}
      <s-section heading="What happens after setup">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="tight">
            <s-paragraph>
              <s-text variant="subdued">• Instagram sends new messages and comments to the app via the webhook.</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">• The app uses AI to understand intent and sends replies with product or checkout links (according to your plan).</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">• Clicks are tracked so you can see which conversations lead to orders.</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="strong">Need help?</s-text> Check the Support page or contact support@socialrepl.ai
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const action = async ({ request }) => {
  await getShopWithPlan(request);
  await authenticate.admin(request);
  return { error: "Invalid action" };
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary({ error }) {
  return boundary.error(error);
}

