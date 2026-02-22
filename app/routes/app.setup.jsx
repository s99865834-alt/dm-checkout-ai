/**
 * Setup route: redirects to Home. No separate setup needed — clients just connect Instagram on Home.
 */
import { redirect } from "react-router";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await getShopWithPlan(request);
  await authenticate.admin(request);
  return redirect("/app");
};
