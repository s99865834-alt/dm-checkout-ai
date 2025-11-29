/**
 * Meta/Instagram Webhook Handler
 * Handles webhook verification and events from Meta (Instagram/Facebook)
 */

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

/**
 * GET handler for webhook verification
 * Meta sends a GET request to verify your webhook endpoint
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  console.log("Meta webhook verification request:", { mode, token: token ? "***" : null, challenge });

  // Verify the token matches
  if (mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN) {
    console.log("Meta webhook verified successfully");
    return new Response(challenge, { status: 200 });
  } else {
    console.log("Meta webhook verification failed");
    return new Response("Forbidden", { status: 403 });
  }
};

/**
 * POST handler for webhook events
 * Meta sends POST requests with actual webhook events
 */
export const action = async ({ request }) => {
  try {
    const body = await request.json();
    console.log("Meta webhook event received:", JSON.stringify(body, null, 2));

    // Handle different webhook event types
    if (body.object === "instagram") {
      // Instagram webhook events
      if (body.entry) {
        for (const entry of body.entry) {
          // Handle comments
          if (entry.messaging) {
            for (const message of entry.messaging) {
              console.log("Instagram message event:", message);
              // TODO: Process message events (DMs, comments, etc.)
            }
          }
          
          // Handle comments
          if (entry.comments) {
            for (const comment of entry.comments) {
              console.log("Instagram comment event:", comment);
              // TODO: Process comment events
            }
          }
        }
      }
    } else if (body.object === "page") {
      // Facebook Page webhook events
      if (body.entry) {
        for (const entry of body.entry) {
          if (entry.messaging) {
            for (const message of entry.messaging) {
              console.log("Facebook message event:", message);
              // TODO: Process Facebook message events
            }
          }
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing Meta webhook:", error);
    return new Response("Error processing webhook", { status: 500 });
  }
};

