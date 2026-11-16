import { Outlet, useLoaderData, useLocation, useRouteError, useNavigate, useNavigation } from "react-router";
import { useEffect, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { layoutShouldRevalidate } from "../lib/home-should-revalidate";
import { FREE_PLAN_ENDS_AT } from "../lib/entitlements";

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

// shop/plan only change through mutations (billing actions, Instagram
// connect/disconnect), so only re-run this loader after one. Plain tab
// switches used to re-run it on every navigation — auth plus shop fetch for
// data that can't have changed — which added a full loader's latency to
// every screen switch.
export const shouldRevalidate = layoutShouldRevalidate;

export default function App() {
  const { apiKey, shop, plan } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const location = useLocation();
  const navRef = useRef(null);

  // Show Shopify admin's native loading bar while a client-side navigation's
  // loader is running, so tab switches never look like a frozen page.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.shopify?.loading !== "function") return;
    window.shopify.loading(navigation.state !== "idle");
  }, [navigation.state]);

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

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav ref={navRef}>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/billing/select">Billing</s-link>
        <s-link href="/app/support">Support</s-link>
      </s-app-nav>
      {plan?.locked && !location.pathname.startsWith("/app/billing") ? (
        <ChoosePlanScreen />
      ) : (
        <>
          {plan?.freePlan?.inGrace && <FreePlanEndingBanner />}
          <Outlet context={{ shop, plan }} />
        </>
      )}
    </AppProvider>
  );
}

const FREE_PLAN_END_LABEL = FREE_PLAN_ENDS_AT.toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});

function FreePlanEndingBanner() {
  return (
    <s-banner tone="warning" heading={`The Free plan ends on ${FREE_PLAN_END_LABEL}`}>
      <s-paragraph>
        Choose Basic ($39/month) or Pro ($99/month) to keep Instagram replies running after that date.
        Both plans start with 14 days free.
      </s-paragraph>
      <s-button slot="secondary-actions" href="/app/billing/select">
        Choose a plan
      </s-button>
    </s-banner>
  );
}

// Every page but billing renders this for a shop with no plan, so there is no
// way into a feature that would silently do nothing.
function ChoosePlanScreen() {
  return (
    <s-page heading="Choose a plan to keep using SocialRepl">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Instagram replies are paused until you choose a plan. Your settings and post mappings are
            saved, and everything switches back on as soon as you subscribe.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Basic, $39/month:</s-text> comment-to-DM, multi-turn conversations,
            brand voice, checkout links with discount codes, order attribution, and 1,000 messages a
            month.
          </s-paragraph>
          <s-paragraph>
            <s-text type="strong">Pro, $99/month:</s-text> everything in Basic, plus story replies,
            follow-up messages, per-post analytics, and 10,000 messages a month.
          </s-paragraph>
          <s-paragraph>
            Both plans start with 14 days free, and you are not charged if you cancel before the trial
            ends.
          </s-paragraph>
          <s-button variant="primary" href="/app/billing/select">
            Choose a plan
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
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
