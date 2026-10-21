/**
 * Verify a Shopify webhook signature without loading the shop's session.
 *
 * authenticate.webhook() does two things: it checks the HMAC, and it loads
 * (and may refresh) the shop's offline session. Only the first is a security
 * requirement. The second is what made the mandatory compliance webhooks fail.
 *
 * 17 Oct 2026: a merchant's customers were bulk-redacted and Shopify delivered
 * roughly 160 customers/redact events inside the same second. Every one had to
 * load a Session row, and every Prisma query in this app is serialised through
 * a single pooled connection on purpose (see lib/prisma-exclusive.js, where
 * DATABASE_URL carries connection_limit=1). The queue meant the later requests
 * took over 6 seconds, Shopify gave up at 5, and the whole burst was logged as
 * "No response from app".
 *
 * customers/data_request and customers/redact are guaranteed no-ops here,
 * because the app stores no Shopify customer PII, so they have no need of a
 * session at all. Verifying the signature directly lets them answer
 * immediately and keeps the single connection free for the webhooks that
 * genuinely need it.
 *
 * Shopify signs the raw request body with the app's client secret and sends
 * base64 HMAC-SHA256 in X-Shopify-Hmac-Sha256.
 * @see https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 */

import crypto from "crypto";

/** Fail closed when no secret is configured rather than trusting the caller. */
function secrets() {
  return [process.env.SHOPIFY_API_SECRET].filter((s) => typeof s === "string" && s.length > 0);
}

/**
 * Constant-time compare of two base64 digests.
 *
 * timingSafeEqual throws when the lengths differ, which a truncated or
 * hand-crafted header will produce, so that has to read as "invalid" rather
 * than surface as a 500 on an unauthenticated endpoint.
 */
function safeEqualBase64(a, b) {
  try {
    const left = Buffer.from(String(a), "base64");
    const right = Buffer.from(String(b), "base64");
    if (left.length !== right.length || left.length === 0) return false;
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/**
 * Is this request a genuine Shopify webhook for the given body?
 *
 * @param {string} rawBody - the exact bytes Shopify sent, before JSON.parse
 * @param {string|null} headerHmac - X-Shopify-Hmac-Sha256
 * @returns {boolean}
 */
export function verifyShopifyWebhookHmac(rawBody, headerHmac) {
  if (typeof rawBody !== "string" || !headerHmac) return false;
  const keys = secrets();
  if (keys.length === 0) return false;

  return keys.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    return safeEqualBase64(headerHmac, expected);
  });
}

/**
 * Read a webhook's body once and verify it, returning the parsed payload and
 * the headers the handler needs. Does not touch the database.
 *
 * @param {Request} request
 * @returns {Promise<{valid: boolean, topic: string, shop: string, webhookId: string|null, payload: any, rawBody: string}>}
 */
export async function readVerifiedShopifyWebhook(request) {
  const rawBody = await request.text();
  const valid = verifyShopifyWebhookHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"));

  let payload = null;
  if (valid) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }
  }

  return {
    valid,
    // Header form is "customers/redact"; the library's context uses
    // "CUSTOMERS_REDACT". Normalised so switch statements keep working either
    // way round.
    topic: (request.headers.get("x-shopify-topic") || "").toUpperCase().replace(/\//g, "_"),
    shop: request.headers.get("x-shopify-shop-domain") || "",
    webhookId: request.headers.get("x-shopify-webhook-id") || null,
    payload,
    rawBody,
  };
}
