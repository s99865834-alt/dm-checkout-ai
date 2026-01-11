import { Outlet, useLoaderData, useRouteError, useNavigate } from "react-router";
import { useEffect, useRef } from "react";
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

// Only revalidate when the shop/plan actually changes, not on every navigation
export const shouldRevalidate = ({ currentUrl, nextUrl }) => {
  // Only revalidate if the URL path actually changed (not just query params)
  return currentUrl.pathname !== nextUrl.pathname;
};

export default function App() {
  const { apiKey, shop, plan } = useLoaderData();
  const navigate = useNavigate();
  const navRef = useRef(null);

  // Intercept s-link clicks for client-side navigation
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handleClick = (e) => {
      // Find the closest s-link element
      const link = e.target.closest('s-link');
      if (link) {
        const href = link.getAttribute('href');
        if (href && href.startsWith('/app')) {
          e.preventDefault();
          e.stopPropagation();
          navigate(href);
        }
      }
    };

    nav.addEventListener('click', handleClick, true);
    return () => {
      nav.removeEventListener('click', handleClick, true);
    };
  }, [navigate]);

  const planBadgeColor = {
    FREE: "subdued",
    GROWTH: "info",
    PRO: "success",
  }[plan.name] || "subdued";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav ref={navRef}>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/setup">Setup</s-link>
        <s-link href="/app/instagram-feed">Instagram Feed</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/billing/select">Billing</s-link>
        <s-link href="/app/support">Support</s-link>
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
