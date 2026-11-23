/**
 * Welcome email rules. Pure, so they are testable.
 */
export const WELCOME_RESEND_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {{isDevStore: boolean|null, isReviewShop: boolean, optedOut: boolean, email: string|null, lastSentAt: string|null}} facts
 * @returns {{send: true} | {send: false, reason: string}}
 */
export function planWelcomeEmail(facts, now = new Date()) {
  if (facts.isReviewShop) return { send: false, reason: "Shopify review store" };
  if (facts.isDevStore === true) return { send: false, reason: "Development store" };
  if (facts.optedOut) return { send: false, reason: "Unsubscribed" };
  if (!facts.email || !EMAIL_RE.test(facts.email)) return { send: false, reason: "No owner email" };
  if (facts.lastSentAt && now - new Date(facts.lastSentAt) < WELCOME_RESEND_DAYS * DAY_MS) {
    return { send: false, reason: "Welcomed recently" };
  }
  return { send: true };
}
