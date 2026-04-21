import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useLoaderData } from "react-router";
import { login } from "../../shopify.server";

const APP_STORE_URL =
  (typeof process !== "undefined" && process.env?.SHOPIFY_APP_STORE_URL) ||
  "https://apps.shopify.com/";

export const loader = async ({ request }) => {
  const loginResult = await login(request);

  // If the Shopify library produced an OAuth redirect (shop param was present),
  // return it directly so the install flow proceeds.
  if (
    loginResult &&
    loginResult instanceof Response &&
    loginResult.status >= 300 &&
    loginResult.status < 400
  ) {
    return loginResult;
  }

  return { appStoreUrl: APP_STORE_URL };
};

export const action = async ({ request }) => {
  const loginResult = await login(request);
  if (
    loginResult &&
    loginResult instanceof Response &&
    loginResult.status >= 300 &&
    loginResult.status < 400
  ) {
    return loginResult;
  }
  return { appStoreUrl: APP_STORE_URL };
};

export default function Auth() {
  const { appStoreUrl } = useLoaderData();

  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Install SocialRepl.ai">
          <s-paragraph>
            To install this app, visit the Shopify App Store listing and click
            &quot;Install&quot; from your Shopify admin.
          </s-paragraph>
          <s-paragraph>
            Already have it installed? Open it from your Shopify admin under
            Apps.
          </s-paragraph>
          <s-button href={appStoreUrl} target="_blank" variant="primary">
            View in Shopify App Store
          </s-button>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
