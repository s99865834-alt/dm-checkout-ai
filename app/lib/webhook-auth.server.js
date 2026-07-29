/**
 * Webhook authentication that tolerates revoked tokens.
 *
 * With expiring offline access tokens (future.expiringOfflineAccessTokens),
 * authenticate.webhook() doesn't just verify the HMAC — it also loads the
 * shop's offline session and, if the access token is expired, refreshes it.
 * The moment a merchant uninstalls, Shopify revokes BOTH the access token and
 * the refresh token, and then delivers webhooks (app/uninstalled immediately,
 * shop/redact 48h later). For those, the refresh always fails and the library
 * throws — a bare 500 Response for most rejections, or the underlying API
 * error for invalid_subject_token. The webhook itself is perfectly authentic;
 * only the (unnecessary) refresh died. Without this wrapper the handler 500s,
 * Shopify retries for 48 hours, and the uninstall cleanup never runs.
 *
 * The fallback below is safe because authenticate.webhook validates the HMAC
 * BEFORE it touches the session: invalid signatures throw 401/400 Responses,
 * which we re-throw untouched. A refresh-stage failure therefore implies the
 * request came from Shopify, so the shop/topic headers (the same headers the
 * library itself reads) can be trusted.
 */

import { authenticate } from "../shopify.server";
import db from "../db.server";
import logger from "./logger.server";

function isRevokedTokenFailure(thrown) {
  // Bare 500 Response: thrown only by the library's refresh-token helper in
  // the webhook path (HMAC failures are 401/400 and happen earlier).
  if (thrown instanceof Response) return thrown.status === 500;
  // Rethrown API errors from the same refresh call.
  if (
    thrown?.response?.code === 400 &&
    thrown?.response?.body?.error === "invalid_subject_token"
  ) {
    return true;
  }
  return thrown?.constructor?.name === "InvalidJwtError";
}

/**
 * Drop-in replacement for authenticate.webhook(request) for handlers that
 * must keep working after the shop's tokens have been revoked (uninstall,
 * GDPR). Returns the normal webhook context when possible; when the token
 * refresh is what failed, returns a minimal context ({shop, topic, payload,
 * session: undefined, admin: undefined}) built from the verified request,
 * and deletes the dead session rows so later webhooks for this shop skip
 * the refresh attempt entirely.
 */
export async function authenticateWebhookTolerant(request) {
  // authenticate.webhook consumes the body; keep a copy for the fallback.
  const rawBody = await request.clone().text();

  try {
    return await authenticate.webhook(request);
  } catch (thrown) {
    if (!isRevokedTokenFailure(thrown)) throw thrown;

    const shop = request.headers.get("x-shopify-shop-domain") || "";
    const topicHeader = request.headers.get("x-shopify-topic") || "";
    if (!shop || !topicHeader) throw thrown;

    logger.debug(
      `[webhook-auth] Token refresh failed for ${shop} (tokens revoked — expected post-uninstall); proceeding with header context`
    );

    // The stored tokens are dead weight and every future webhook would trip
    // over refreshing them — remove the session rows now.
    try {
      await db.session.deleteMany({ where: { shop } });
    } catch (e) {
      console.error(`[webhook-auth] Failed deleting dead sessions for ${shop}:`, e?.message);
    }

    let payload = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }

    return {
      shop,
      // Header form is "app/uninstalled"; the library's context uses
      // "APP_UNINSTALLED" — normalize so switch statements keep working.
      topic: topicHeader.toUpperCase().replace(/\//g, "_"),
      payload,
      webhookId: request.headers.get("x-shopify-webhook-id") || undefined,
      session: undefined,
      admin: undefined,
    };
  }
}
