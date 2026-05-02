import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";

// The standalone beta trial-code redemption flow no longer exists. Plan
// selection (and any per-plan trial that may be configured later in the
// Partner Dashboard) happens on Shopify's hosted Managed Pricing page.
// Old bookmarks land here and get forwarded to the unified billing page.
export const loader = async () => {
  return redirect("/app/billing/select");
};

export const action = async () => {
  return redirect("/app/billing/select");
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
