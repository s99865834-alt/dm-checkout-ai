import { useLoaderData, useFetcher, useOutletContext } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { 
  getMetaAuth, 
  getMetaAuthWithRefresh, 
  refreshMetaToken,
  metaGraphAPIWithRefresh,
  getInstagramAccountInfo,
  subscribeToWebhooks
} from "../lib/meta.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);
  
  // Get Meta auth info
  let metaAuth = null;
  let metaAuthWithRefresh = null;
  let instagramInfo = null;
  let tokenRefreshStatus = null;
  
  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);
    
    if (metaAuth) {
      // Test token refresh check
      try {
        metaAuthWithRefresh = await getMetaAuthWithRefresh(shop.id);
        tokenRefreshStatus = {
          needsRefresh: metaAuthWithRefresh !== metaAuth,
          expiresAt: metaAuth.token_expires_at,
          daysUntilExpiry: metaAuth.token_expires_at 
            ? Math.floor((new Date(metaAuth.token_expires_at) - new Date()) / (1000 * 60 * 60 * 24))
            : null,
        };
      } catch (error) {
        tokenRefreshStatus = {
          error: error.message,
        };
      }
      
      // Test API call with refresh
      if (metaAuth.ig_business_id) {
        try {
          instagramInfo = await getInstagramAccountInfo(metaAuth.ig_business_id, shop.id);
        } catch (error) {
          instagramInfo = { error: error.message };
        }
      }
    }
  }
  
  return { shop, plan, metaAuth, metaAuthWithRefresh, instagramInfo, tokenRefreshStatus };
};

export const action = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);

  if (!shop?.id) {
    return { error: "Shop not found" };
  }

  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    if (actionType === "refresh-token") {
      // Manually trigger token refresh
      const refreshed = await refreshMetaToken(shop.id);
      return { 
        success: true, 
        message: "Token refreshed successfully",
        expiresAt: refreshed.token_expires_at,
      };
    } else if (actionType === "test-api") {
      // Test API call with automatic refresh
      const metaAuth = await getMetaAuth(shop.id);
      if (!metaAuth?.ig_business_id) {
        return { error: "No Instagram Business ID found. Please connect Instagram first." };
      }
      
      const accountInfo = await metaGraphAPIWithRefresh(
        shop.id,
        `/${metaAuth.ig_business_id}`,
        "page",
        {
          params: {
            fields: "username,media_count,profile_picture_url",
          },
        }
      );
      
      return { 
        success: true, 
        message: "API call successful",
        data: accountInfo,
      };
    } else if (actionType === "subscribe-webhooks") {
      // Test webhook subscription
      const metaAuth = await getMetaAuth(shop.id);
      if (!metaAuth?.page_id || !metaAuth?.ig_business_id) {
        return { error: "No Page ID or IG Business ID found. Please connect Instagram first." };
      }
      
      const result = await subscribeToWebhooks(shop.id, metaAuth.page_id, metaAuth.ig_business_id);
      return { 
        success: result, 
        message: result 
          ? "Webhook subscription initiated" 
          : "Webhook subscription failed (check logs)",
      };
    }
    
    return { error: "Invalid action" };
  } catch (error) {
    console.error("[test] Error:", error);
    return { error: error.message || "Unknown error" };
  }
};

export default function MetaTest() {
  const { shop, plan, metaAuth, metaAuthWithRefresh, instagramInfo, tokenRefreshStatus } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <s-page heading="Meta/Instagram Testing (Dev Only)">
      <s-section>
        <s-callout variant="warning" title="Development Tool">
          <s-paragraph>
            This page is for testing Week 7 functionality: token refresh, API calls, and webhook subscription.
            <s-text variant="strong"> Remove this route before production!</s-text>
          </s-paragraph>
        </s-callout>
      </s-section>

      {fetcher.data?.error && (
        <s-section>
          <s-callout variant="critical" title="Error">
            <s-paragraph>
              <s-text>{fetcher.data.error}</s-text>
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      {fetcher.data?.success && (
        <s-section>
          <s-callout variant="success" title="Success">
            <s-paragraph>
              <s-text>{fetcher.data.message}</s-text>
              {fetcher.data.expiresAt && (
                <s-text> Token expires: {new Date(fetcher.data.expiresAt).toLocaleString()}</s-text>
              )}
              {fetcher.data.data && (
                <s-box padding="base" margin="base" borderWidth="base" borderRadius="base" background="subdued">
                  <pre style={{ margin: 0, fontSize: "12px", overflow: "auto" }}>
                    {JSON.stringify(fetcher.data.data, null, 2)}
                  </pre>
                </s-box>
              )}
            </s-paragraph>
          </s-callout>
        </s-section>
      )}

      <s-section heading="Connection Status">
        <s-stack direction="block" gap="base">
          {metaAuth ? (
            <>
              <s-paragraph>
                <s-text variant="strong">Status:</s-text> Connected
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">Page ID:</s-text> {metaAuth.page_id}
              </s-paragraph>
              <s-paragraph>
                <s-text variant="strong">IG Business ID:</s-text> {metaAuth.ig_business_id}
              </s-paragraph>
              {metaAuth.token_expires_at && (
                <s-paragraph>
                  <s-text variant="strong">Token Expires:</s-text> {new Date(metaAuth.token_expires_at).toLocaleString()}
                </s-paragraph>
              )}
            </>
          ) : (
            <s-paragraph>
              <s-text variant="strong">Status:</s-text> Not Connected
            </s-paragraph>
          )}
        </s-stack>
      </s-section>

      {metaAuth && (
        <>
          <s-section heading="Token Refresh Status">
            <s-stack direction="block" gap="base">
              {tokenRefreshStatus?.error ? (
                <s-paragraph>
                  <s-text variant="strong" tone="critical">Error:</s-text> {tokenRefreshStatus.error}
                </s-paragraph>
              ) : (
                <>
                  {tokenRefreshStatus?.daysUntilExpiry !== null && (
                    <s-paragraph>
                      <s-text variant="strong">Days Until Expiry:</s-text> {tokenRefreshStatus.daysUntilExpiry}
                    </s-paragraph>
                  )}
                  <s-paragraph>
                    <s-text variant="strong">Needs Refresh:</s-text> {tokenRefreshStatus?.needsRefresh ? "Yes" : "No"}
                  </s-paragraph>
                  {tokenRefreshStatus?.needsRefresh && (
                    <s-paragraph tone="subdued">
                      Token was automatically refreshed when checked
                    </s-paragraph>
                  )}
                </>
              )}
            </s-stack>
          </s-section>

          <s-section heading="Instagram Account Info (API Test)">
            <s-stack direction="block" gap="base">
              {instagramInfo?.error ? (
                <s-paragraph>
                  <s-text variant="strong" tone="critical">Error:</s-text> {instagramInfo.error}
                </s-paragraph>
              ) : instagramInfo ? (
                <>
                  {instagramInfo.username && (
                    <s-paragraph>
                      <s-text variant="strong">Username:</s-text> @{instagramInfo.username}
                    </s-paragraph>
                  )}
                  {instagramInfo.mediaCount !== undefined && (
                    <s-paragraph>
                      <s-text variant="strong">Media Count:</s-text> {instagramInfo.mediaCount}
                    </s-paragraph>
                  )}
                  {instagramInfo.profilePictureUrl && (
                    <s-paragraph>
                      <s-text variant="strong">Profile Picture:</s-text>{" "}
                      <s-link href={instagramInfo.profilePictureUrl} target="_blank">
                        View
                      </s-link>
                    </s-paragraph>
                  )}
                </>
              ) : (
                <s-paragraph tone="subdued">No Instagram info available</s-paragraph>
              )}
            </s-stack>
          </s-section>

          <s-section heading="Test Actions">
            <s-stack direction="block" gap="base">
              <fetcher.Form method="post">
                <input type="hidden" name="action" value="refresh-token" />
                <s-button 
                  type="submit" 
                  variant="secondary"
                  loading={fetcher.state === "submitting"}
                >
                  Manually Refresh Token
                </s-button>
              </fetcher.Form>

              <fetcher.Form method="post">
                <input type="hidden" name="action" value="test-api" />
                <s-button 
                  type="submit" 
                  variant="secondary"
                  loading={fetcher.state === "submitting"}
                >
                  Test API Call (with auto-refresh)
                </s-button>
              </fetcher.Form>

              <fetcher.Form method="post">
                <input type="hidden" name="action" value="subscribe-webhooks" />
                <s-button 
                  type="submit" 
                  variant="secondary"
                  loading={fetcher.state === "submitting"}
                >
                  Test Webhook Subscription
                </s-button>
              </fetcher.Form>
            </s-stack>
          </s-section>
        </>
      )}

      {!metaAuth && (
        <s-section>
          <s-callout variant="info" title="Not Connected">
            <s-paragraph>
              Please connect your Instagram Business account from the Home page before testing.
            </s-paragraph>
          </s-callout>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary({ error }) {
  return boundary.error(error);
}

