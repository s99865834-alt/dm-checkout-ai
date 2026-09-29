import { authenticate } from "../shopify.server";
import db from "../db.server";
import logger from "../lib/logger.server";

// Webhooks are POST-only; answer crawler GETs with a 405 instead of letting
// React Router warn about rendering a component-less route.
export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }) => {
  try {
    const { payload, session, topic, shop } = await authenticate.webhook(request);

    logger.debug(`Received ${topic} webhook for ${shop}`);

    // Mirroring the scope onto the session is bookkeeping, not something the
    // request depends on, so nothing here is worth a 500. This handler used to
    // be unguarded and returned one during a plan upgrade on 29 Sep 2026:
    // Shopify delivers scopes_update while the app is loading and the session
    // row is being rotated, so the update can hit a row that is momentarily
    // missing. Shopify retries a 500, and a webhook that keeps failing risks
    // the subscription being turned off, which would cost us scope changes
    // for every merchant.
    const current = payload?.current;
    if (session?.id && current != null) {
      try {
        await db.session.update({
          where: { id: session.id },
          data: { scope: Array.isArray(current) ? current.join(",") : String(current) },
        });
      } catch (error) {
        // P2025 is Prisma for "record to update not found", which is the
        // rotating-session race and resolves itself on the next auth.
        logger.warn(
          `[webhook] scopes_update could not update session for ${shop}: ${error?.code || error?.message}`,
        );
      }
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    // HMAC rejection arrives as a Response and must pass through untouched so
    // a forged request still gets the right status.
    if (error instanceof Response) throw error;
    console.error("[webhook] Error processing app/scopes_update webhook:", error);
    return new Response(null, { status: 200 });
  }
};
