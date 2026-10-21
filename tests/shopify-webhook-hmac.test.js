/**
 * Signature verification for the compliance fast path.
 *
 * 17 Oct 2026: a merchant's customers were bulk-redacted and Shopify delivered
 * roughly 160 customers/redact events inside one second. Each had to load a
 * Session row, every Prisma query here is serialised through a single pooled
 * connection on purpose, and the back of that queue took over 6 seconds.
 * Shopify gives up at 5, so most of the burst was logged as "No response from
 * app" in the Partner dashboard.
 *
 * Those topics store nothing, so they no longer need the session. That makes
 * this file the only thing standing between an unauthenticated POST and a
 * 200, which is why the cases below are deliberately unkind.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

import {
  verifyShopifyWebhookHmac,
  readVerifiedShopifyWebhook,
} from "../app/lib/shopify-webhook-hmac.server";

const SECRET = "shpss_test_secret_value_0123456789";
const BODY = JSON.stringify({ shop_id: 3035889, customer: { id: 191167 } });

const sign = (body, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");

const originalSecret = process.env.SHOPIFY_API_SECRET;

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SHOPIFY_API_SECRET;
  else process.env.SHOPIFY_API_SECRET = originalSecret;
  vi.unstubAllEnvs();
});

describe("verifyShopifyWebhookHmac", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyShopifyWebhookHmac(BODY, sign(BODY))).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    const tampered = BODY.replace("191167", "191168");
    expect(verifyShopifyWebhookHmac(tampered, sign(BODY))).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyShopifyWebhookHmac(BODY, sign(BODY, "someone-elses-secret"))).toBe(false);
  });

  it("rejects a missing, empty or junk signature", () => {
    expect(verifyShopifyWebhookHmac(BODY, null)).toBe(false);
    expect(verifyShopifyWebhookHmac(BODY, "")).toBe(false);
    expect(verifyShopifyWebhookHmac(BODY, "not-base64-at-all!!")).toBe(false);
  });

  it("rejects a truncated signature instead of throwing", () => {
    // timingSafeEqual throws on length mismatch; an unauthenticated endpoint
    // must not turn that into a 500.
    const short = sign(BODY).slice(0, 20);
    expect(() => verifyShopifyWebhookHmac(BODY, short)).not.toThrow();
    expect(verifyShopifyWebhookHmac(BODY, short)).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    delete process.env.SHOPIFY_API_SECRET;
    expect(verifyShopifyWebhookHmac(BODY, sign(BODY))).toBe(false);
  });

  it("rejects a non-string body", () => {
    expect(verifyShopifyWebhookHmac(null, sign(BODY))).toBe(false);
    expect(verifyShopifyWebhookHmac({ a: 1 }, sign(BODY))).toBe(false);
  });

  it("is sensitive to the exact bytes, not the parsed object", () => {
    // Same JSON semantically, different serialisation. Shopify signs bytes.
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyShopifyWebhookHmac(reserialised, sign(BODY))).toBe(false);
  });
});

describe("readVerifiedShopifyWebhook", () => {
  const makeRequest = (body, hmac, topic = "customers/redact") =>
    new Request("https://example.com/webhooks/compliance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-Sha256": hmac,
        "X-Shopify-Topic": topic,
        "X-Shopify-Shop-Domain": "polished-holistic.myshopify.com",
        "X-Shopify-Webhook-Id": "46b9c2cd-e953-5109-8241-0e541b832be0",
      },
      body,
    });

  it("verifies and normalises a genuine delivery", async () => {
    const result = await readVerifiedShopifyWebhook(makeRequest(BODY, sign(BODY)));

    expect(result.valid).toBe(true);
    expect(result.topic).toBe("CUSTOMERS_REDACT");
    expect(result.shop).toBe("polished-holistic.myshopify.com");
    expect(result.webhookId).toBe("46b9c2cd-e953-5109-8241-0e541b832be0");
    expect(result.payload.customer.id).toBe(191167);
  });

  it("does not parse the payload of an unverified request", async () => {
    const result = await readVerifiedShopifyWebhook(makeRequest(BODY, sign(BODY, "wrong")));

    expect(result.valid).toBe(false);
    expect(result.payload).toBeNull();
  });

  it("normalises the data_request topic too", async () => {
    const result = await readVerifiedShopifyWebhook(
      makeRequest(BODY, sign(BODY), "customers/data_request")
    );
    expect(result.topic).toBe("CUSTOMERS_DATA_REQUEST");
  });

  it("survives a body that is not JSON", async () => {
    const notJson = "this is not json";
    const result = await readVerifiedShopifyWebhook(makeRequest(notJson, sign(notJson)));

    expect(result.valid).toBe(true);
    expect(result.payload).toBeNull();
  });
});
