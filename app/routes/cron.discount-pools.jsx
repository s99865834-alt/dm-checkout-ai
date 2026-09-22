/**
 * Cron endpoint for discount code pool maintenance.
 *
 * Every Shopify call the discount feature makes happens here, deliberately.
 * Replies only read a pre-minted code out of Postgres, so a slow or failing
 * Shopify API can never delay an Instagram private reply.
 *
 * Railway cron: call https://your-app-url/cron/discount-pools?secret=...
 * Schedule: every 15 minutes is plenty. The buffer per variant covers the gap
 * between runs, and a variant that outruns its buffer just sends links without
 * a discount until the next pass.
 */

import { runDiscountPoolMaintenance } from "../lib/discount-pool.server";
import logger from "../lib/logger.server";

const CRON_SECRET = process.env.CRON_SECRET;

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    console.error("[cron] Invalid or missing cron secret");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    logger.debug("[cron] Starting discount pool maintenance...");
    const result = await runDiscountPoolMaintenance();
    logger.debug("[cron] Discount pool maintenance completed");

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cron] Error running discount pool maintenance:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
