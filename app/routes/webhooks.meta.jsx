/**
 * Meta/Instagram Webhook Handler
 * Handles webhook verification and events from Meta (Instagram/Facebook)
 * 
 * Week 6: Basic webhook verification and event logging
 * Week 8: Will add message/comment processing logic
 */

// Polyfill crypto for Meta webhook HMAC validation
import crypto from "crypto";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;

/**
 * GET handler for webhook verification
 * Meta sends a GET request to verify your webhook endpoint
 * 
 * Verification flow:
 * 1. Meta sends: GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=RANDOM_STRING
 * 2. We verify the token matches META_WEBHOOK_VERIFY_TOKEN
 * 3. We return the challenge string to prove we control the endpoint
 */
export const loader = async ({ request }) => {
  console.log(`[webhook] Meta webhook verification request received`);
  
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log(`[webhook] Verification params:`, {
      mode,
      token: token ? "***" : null,
      challenge: challenge ? "***" : null,
    });

    // Verify the token matches
    if (mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN) {
      console.log(`[webhook] Meta webhook verified successfully`);
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    } else {
      console.error(`[webhook] Meta webhook verification failed:`, {
        mode,
        tokenMatch: token === META_WEBHOOK_VERIFY_TOKEN,
        hasToken: !!token,
        hasVerifyToken: !!META_WEBHOOK_VERIFY_TOKEN,
      });
      return new Response("Forbidden", { status: 403 });
    }
  } catch (error) {
    console.error(`[webhook] Error during webhook verification:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

/**
 * POST handler for webhook events
 * Meta sends POST requests with actual webhook events
 * 
 * Week 6: Logs events for inspection
 * Week 8: Will process comments and DMs
 */
export const action = async ({ request }) => {
  console.log(`[webhook] Meta webhook event received`);
  
  if (request.method !== "POST") {
    console.error(`[webhook] Invalid method: ${request.method}`);
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Read body as text first for HMAC verification
    const bodyText = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    // Verify HMAC signature if app secret is configured
    if (META_APP_SECRET && signature) {
      const expectedSignature = `sha256=${crypto
        .createHmac("sha256", META_APP_SECRET)
        .update(bodyText)
        .digest("hex")}`;

      if (signature !== expectedSignature) {
        console.error(`[webhook] Invalid HMAC signature`);
        console.error(`[webhook] Expected: ${expectedSignature.substring(0, 20)}...`);
        console.error(`[webhook] Received: ${signature?.substring(0, 20)}...`);
        return new Response("Invalid signature", { status: 403 });
      }
      console.log(`[webhook] HMAC signature verified`);
    } else {
      console.log(`[webhook] HMAC verification skipped (no app secret or signature)`);
    }

    // Parse JSON body
    const body = JSON.parse(bodyText);
    console.log(`[webhook] Meta webhook event:`, JSON.stringify(body, null, 2));

    // Handle different webhook event types
    if (body.object === "instagram") {
      console.log(`[webhook] Instagram webhook event`);
      
      if (body.entry) {
        for (const entry of body.entry) {
          console.log(`[webhook] Processing entry:`, entry.id);
          
          // Handle messaging events (DMs)
          if (entry.messaging) {
            for (const message of entry.messaging) {
              console.log(`[webhook] Instagram message event:`, message);
              // TODO Week 8: Process message events (DMs)
            }
          }
          
          // Handle comment events
          if (entry.comments) {
            for (const comment of entry.comments) {
              console.log(`[webhook] Instagram comment event:`, comment);
              // TODO Week 8: Process comment events
            }
          }
        }
      }
    } else if (body.object === "page") {
      console.log(`[webhook] Facebook Page webhook event`);
      
      if (body.entry) {
        for (const entry of body.entry) {
          console.log(`[webhook] Processing page entry:`, entry.id);
          
          if (entry.messaging) {
            for (const message of entry.messaging) {
              console.log(`[webhook] Facebook message event:`, message);
              // TODO Week 8: Process Facebook message events
            }
          }
        }
      }
    } else {
      console.log(`[webhook] Unknown webhook object type: ${body.object}`);
    }

    // Always return 200 to acknowledge receipt (prevents retries)
    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error(`[webhook] Error processing Meta webhook:`, error);
    console.error(`[webhook] Error stack:`, error.stack);
    
    // Return 200 even on error to prevent Meta from retrying
    // (We'll log the error for debugging)
    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
};



