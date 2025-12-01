import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { getShopWithPlan } from "../lib/loader-helpers.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop,
    plan,
  };
};

export default function App() {
  const { apiKey, shop, plan } = useLoaderData();

  const planBadgeColor = {
    FREE: "subdued",
    GROWTH: "info",
    PRO: "success",
  }[plan.name] || "subdued";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/instagram">Instagram Feed</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/support">Support</s-link>
        <s-link href="/app/test-shop">Test Shop</s-link>
      </s-app-nav>
      <Outlet context={{ shop, plan }} />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
