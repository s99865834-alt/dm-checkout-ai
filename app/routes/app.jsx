import { Outlet, useLoaderData, useRouteError, useNavigate } from "react-router";
import { useEffect, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { getShopWithPlan } from "../lib/loader-helpers.server";

// shop.plan is the source of truth in the DB. It's written authoritatively
// by /app/billing/activate (after Managed Pricing approval, using the
// plan=… URL param Shopify sends) and by the FREE downgrade action in
// /app/billing/select. We deliberately do NOT re-sync from the active
// Shopify subscription here — doing so on every /app/* request races
// with both of those write paths and silently reverts correctly-set
// plans (e.g. just-upgraded PRO -> GROWTH, or just-cancelled FREE ->
// previous paid plan).
export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);

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

export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
