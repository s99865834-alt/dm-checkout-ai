/**
 * Cron endpoint for follow-up automation
 * Should be called by Railway cron or similar scheduler every hour
 * 
 * To set up Railway cron:
 * - Add a cron job that calls: https://your-app-url/cron/followups
 * - Schedule: 0 * * * * (every hour)
 * - Add CRON_SECRET to environment variables
 */

import { processFollowups } from "../lib/followup.server";

const CRON_SECRET = process.env.CRON_SECRET;

export const loader = async ({ request }) => {
  // Verify cron secret for security
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    console.error("[cron] Invalid or missing cron secret");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("[cron] Starting follow-up processing...");
    await processFollowups();
    console.log("[cron] Follow-up processing completed");
    
    return new Response(JSON.stringify({ success: true, message: "Follow-ups processed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cron] Error processing follow-ups:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

