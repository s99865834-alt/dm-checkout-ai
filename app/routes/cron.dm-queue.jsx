/**
 * Cron endpoint for outbound DM queue processing
 * Call every minute with ?secret=CRON_SECRET
 */
import { processDmQueue } from "../lib/queue.server";

const CRON_SECRET = process.env.CRON_SECRET;

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    console.error("[cron] Invalid or missing cron secret");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("[cron] Starting DM queue processing...");
    const result = await processDmQueue();
    console.log("[cron] DM queue processing completed", result);
    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cron] Error processing DM queue:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
