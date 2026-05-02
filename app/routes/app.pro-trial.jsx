import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";

// The standalone beta trial-code redemption flow no longer exists. Trial
// periods are now configured per-plan in the Shopify Partner Dashboard
// (Managed Pricing), so any merchant who subscribes to Growth or Pro gets
// the configured free trial automatically. Old bookmarks land here and get
// forwarded to the unified billing page.
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
