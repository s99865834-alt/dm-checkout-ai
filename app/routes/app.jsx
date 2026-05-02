import { Outlet, redirect, useLoaderData, useRouteError, useNavigate } from "react-router";
import { useEffect, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { syncShopPlanWithSubscription } from "../lib/billing.server";

export const loader = async ({ request }) => {
  const { shop, plan, admin } = await getShopWithPlan(request);

  // Sync shop.plan with the merchant's active Shopify subscription on
  // every entry to /app/*. This is the canonical place to do it because:
  //   - The embedded session is reliably set up at this layer (it isn't
  //     always at the bare app root /, where App Bridge can race with
  //     authenticate.admin and bounce us into /auth/login).
  //   - It catches the post-Managed-Pricing-approval flow: Shopify
  //     redirects merchants back to the app's main URL with no charge_id,
  //     so we have to re-derive plan state from the active subscription.
  //
  // If the sync changed the plan AND we're not already on the billing
  // page, send the merchant to /app/billing/select so they immediately
  // see the updated "Current Plan" badge.
  if (shop?.id) {
    try {
      const { changed, planAfter } = await syncShopPlanWithSubscription(admin, shop);
      if (changed) {
        const url = new URL(request.url);
        if (!url.pathname.startsWith("/app/billing")) {
          // Preserve embedded auth params (id_token, host, shop, embedded,
          // hmac, locale, session, timestamp) so the next request still
          // authenticates. A bare /app/billing/select redirect would land
          // at the framework's auth middleware with no credentials and
          // bounce the merchant to /auth/login (the install page).
          url.pathname = "/app/billing/select";
          throw redirect(`${url.pathname}${url.search}`);
        }
        // Reflect the new plan in this render without a revalidation.
        plan.name = planAfter;
      }
    } catch (err) {
      if (err instanceof Response) throw err;
      console.error("[app] Plan sync error:", err.message);
    }
  }

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
