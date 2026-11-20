import crypto from "node:crypto";

function secret() {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SHOPIFY_API_SECRET || "";
}

export function unsubscribeToken(shopId) {
  const key = secret();
  if (!key || !shopId) return null;
  return crypto.createHmac("sha256", key).update(`unsubscribe:${shopId}`).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(shopId, token) {
  const expected = unsubscribeToken(shopId);
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function unsubscribeUrl(appUrl, shopId) {
  const token = unsubscribeToken(shopId);
  if (!appUrl || !token) return null;
  const base = String(appUrl).replace(/\/$/, "");
  return `${base}/email/unsubscribe?s=${encodeURIComponent(shopId)}&t=${token}`;
}
