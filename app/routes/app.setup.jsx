import { useEffect } from "react";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth, getMetaAuthWithRefresh, metaGraphAPI } from "../lib/meta.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);

  let metaAuth = null;
  let webhookStatus = null;
  let instagramInfo = null;

  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);

    if (metaAuth?.page_id && metaAuth?.ig_business_id) {
      // Check webhook subscription status
      try {
        const authWithRefresh = await getMetaAuthWithRefresh(shop.id);
        if (authWithRefresh?.page_access_token) {
          // Check if Page is subscribed to webhooks
          try {
            const subscriptionData = await metaGraphAPI(
              `/${metaAuth.page_id}/subscribed_apps`,
              authWithRefresh.page_access_token
            );

            // Meta API returns data in format: { data: [{ id: "app_id", subscribed_fields: [...] }] }
            if (subscriptionData?.data && Array.isArray(subscriptionData.data) && subscriptionData.data.length > 0) {
              const appId = process.env.META_APP_ID;
              const appSubscription = subscriptionData.data.find(
                (sub) => sub.id === appId
              );
              
              if (appSubscription) {
                const fields = appSubscription.subscribed_fields || [];
                webhookStatus = {
                  subscribed: true,
                  fields: fields,
                  hasMessages: fields.includes("messages"),
                  hasComments: fields.includes("comments"),
                };
              } else {
                webhookStatus = {
                  subscribed: false,
                  message: "App not found in webhook subscriptions. Please enable 'Allow access to messages' in Instagram app.",
                };
              }
            } else {
              webhookStatus = {
                subscribed: false,
                message: "No webhook subscriptions found. Please enable 'Allow access to messages' in Instagram app.",
              };
            }
          } catch (apiError) {
            console.error("[setup] Error checking webhook subscription:", apiError);
            // If API call fails, assume webhooks aren't working
            webhookStatus = {
              subscribed: false,
              error: "Could not verify webhook status. Please ensure 'Allow access to messages' is enabled in Instagram app.",
            };
          }
        }

        // Get Instagram account info
        if (metaAuth.ig_business_id) {
          try {
            instagramInfo = await metaGraphAPI(
              `/${metaAuth.ig_business_id}`,
              authWithRefresh.page_access_token,
              {
                params: {
                  fields: "username,media_count,profile_picture_url",
                },
              }
            );
          } catch (error) {
            console.error("[setup] Error fetching Instagram info:", error);
          }
        }
      } catch (error) {
        console.error("[setup] Error checking webhook status:", error);
        webhookStatus = {
          subscribed: false,
          error: error.message || "Failed to check webhook status",
        };
      }
    }
  }

  return {
    shop,
    plan,
    metaAuth,
    webhookStatus,
    instagramInfo,
  };
};

export default function SetupPage() {
  const { shop, plan, metaAuth, webhookStatus, instagramInfo } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  // Refresh page after checking webhooks
  useEffect(() => {
    if (fetcher.data?.refresh) {
      navigate("/app/setup", { replace: true });
    }
  }, [fetcher.data, navigate]);

  const isConnected = !!metaAuth;
  const webhooksWorking = webhookStatus?.subscribed === true;
  const hasMessagesField = webhookStatus?.hasMessages === true || webhookStatus?.fields?.includes("messages");
  const hasCommentsField = webhookStatus?.hasComments === true || webhookStatus?.fields?.includes("comments");

  return (
    <s-page heading="Setup Guide">
      <s-section>
        <s-callout variant="info" title="Getting Started">
          <s-paragraph>
            Follow these steps to set up your Instagram automation. Most steps are automatic, but you'll need to enable one setting in your Instagram app.
          </s-paragraph>
        </s-callout>
      </s-section>

      {/* Step 1: Connect Instagram */}
      <s-section heading="Step 1: Connect Instagram Business Account">
        {isConnected ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="success">
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                <s-text variant="strong" tone="success">✅ Instagram Connected</s-text>
              </s-paragraph>
              {instagramInfo && (
                <s-paragraph>
                  <s-text variant="subdued">
                    Connected to: @{instagramInfo.username || "Instagram Business Account"}
                  </s-text>
                </s-paragraph>
              )}
              {metaAuth?.page_id && (
                <s-paragraph>
                  <s-text variant="subdued">
                    Facebook Page ID: {metaAuth.page_id}
                  </s-text>
                </s-paragraph>
              )}
            </s-stack>
          </s-box>
        ) : (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Connect your Instagram Business account to enable automation features.
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

      {/* Step 2: Enable Access to Messages */}
      {isConnected && (
        <s-section heading="Step 2: Enable 'Allow Access to Messages' in Instagram">
          {webhooksWorking ? (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="success">
              <s-stack direction="block" gap="tight">
                <s-paragraph>
                  <s-text variant="strong" tone="success">✅ Webhooks Active</s-text>
                </s-paragraph>
                <s-paragraph>
                  <s-text variant="subdued">
                    Your Instagram account is properly configured and receiving messages/comments.
                  </s-text>
                </s-paragraph>
                {hasMessagesField && (
                  <s-badge tone="success">Messages: Subscribed</s-badge>
                )}
                {hasCommentsField && (
                  <s-badge tone="success">Comments: Subscribed</s-badge>
                )}
              </s-stack>
            </s-box>
          ) : (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="warning">
              <s-stack direction="block" gap="base">
                <s-paragraph>
                  <s-text variant="strong" tone="warning">⚠️ Action Required</s-text>
                </s-paragraph>
                <s-paragraph>
                  To receive Instagram messages and comments, you need to enable "Allow access to messages" in your Instagram app settings.
                </s-paragraph>
                
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="base">
                    <s-paragraph>
                      <s-text variant="strong">How to Enable:</s-text>
                    </s-paragraph>
                    <s-stack direction="block" gap="tight">
                      <s-paragraph>
                        <s-text>1. Open the <s-text variant="strong">Instagram app</s-text> on your phone</s-text>
                      </s-paragraph>
                      <s-paragraph>
                        <s-text>2. Go to your <s-text variant="strong">business profile</s-text> (@{instagramInfo?.username || "your_account"})</s-text>
                      </s-paragraph>
                      <s-paragraph>
                        <s-text>3. Tap the <s-text variant="strong">menu icon</s-text> (three lines) in the top-right corner</s-text>
                      </s-paragraph>
                      <s-paragraph>
                        <s-text>4. Select <s-text variant="strong">Settings and activity</s-text></s-text>
                      </s-paragraph>
                      <s-paragraph>
                        <s-text>5. Go to <s-text variant="strong">Messages and story replies</s-text></s-text>
                      </s-paragraph>
                      <s-paragraph>
                        <s-text>6. Under <s-text variant="strong">Message requests</s-text>, find <s-text variant="strong">Connected tools</s-text></s-text>
                      </s-paragraph>
                      <s-paragraph>
                        <s-text>7. Toggle <s-text variant="strong">ON "Allow access to messages"</s-text> ✅</s-text>
                      </s-paragraph>
                    </s-stack>
                  </s-stack>
                </s-box>

                <s-paragraph>
                  <s-text variant="subdued">
                    After enabling this setting, webhooks will automatically start working. You may need to wait a few minutes for the change to take effect.
                  </s-text>
                </s-paragraph>

                <fetcher.Form method="post">
                  <input type="hidden" name="action" value="check-webhooks" />
                  <s-button
                    type="submit"
                    variant="secondary"
                    loading={fetcher.state === "submitting"}
                  >
                    {fetcher.state === "submitting" ? "Checking..." : "Check Webhook Status Again"}
                  </s-button>
                </fetcher.Form>

                {webhookStatus?.error && (
                  <s-callout variant="warning" title="Note">
                    <s-paragraph>
                      <s-text variant="subdued">
                        {webhookStatus.error}
                      </s-text>
                    </s-paragraph>
                  </s-callout>
                )}
              </s-stack>
            </s-box>
          )}
        </s-section>
      )}

      {/* Step 3: Verify Setup */}
      {isConnected && (
        <s-section heading="Step 3: Verify Your Setup">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text variant="strong">Setup Checklist:</s-text>
              </s-paragraph>
              <s-stack direction="block" gap="tight">
                <s-paragraph>
                  {isConnected ? (
                    <s-text>✅ Instagram Business account connected</s-text>
                  ) : (
                    <s-text>❌ Instagram Business account not connected</s-text>
                  )}
                </s-paragraph>
                <s-paragraph>
                  {webhooksWorking ? (
                    <s-text>✅ Ready to receive messages and comments</s-text>
                  ) : (
                    <s-text>⚠️ Action required - enable "Allow access to messages" in Instagram app (see Step 2 above)</s-text>
                  )}
                </s-paragraph>
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* Additional Information */}
      <s-section heading="Additional Information">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text variant="strong">Why is "Allow access to messages" required?</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Instagram requires explicit permission for third-party apps to access your messages. This is a security feature to protect your account. Without this setting enabled, Instagram will not send webhook events to our app, and automation will not work.
              </s-text>
            </s-paragraph>

            <s-paragraph>
              <s-text variant="strong">What happens after setup?</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Once your Instagram account is connected and "Allow access to messages" is enabled, the app will automatically:
              </s-text>
            </s-paragraph>
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                <s-text variant="subdued">• Receive Instagram DMs and comments via webhooks</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">• Process messages using AI to understand intent</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">• Send automated responses with product links (based on your plan)</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">• Track clicks and attribute orders back to Instagram interactions</s-text>
              </s-paragraph>
            </s-stack>

            <s-paragraph>
              <s-text variant="strong">Need Help?</s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                If you're having trouble with setup, check the <s-link href="/app/support">Support</s-link> page or contact us at support@socialrepl.ai
              </s-text>
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const action = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);

  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "check-webhooks") {
    // Re-check webhook status by redirecting to refresh the loader
    // This will trigger the loader to check webhook status again
    return { success: true, refresh: true };
  }

  return { error: "Invalid action" };
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary({ error }) {
  return boundary.error(error);
}

