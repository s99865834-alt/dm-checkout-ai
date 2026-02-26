/**
 * Setup route: redirects to Home. No separate setup needed — clients just connect Instagram on Home.
 */
import { redirect } from "react-router";
import { getShopWithPlan } from "../lib/loader-helpers.server";

export const loader = async ({ request }) => {
  await getShopWithPlan(request);
  return redirect("/app");
};
