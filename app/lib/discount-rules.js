/**
 * Rules and copy for single-use checkout discounts.
 *
 * Pure apart from crypto, so it can be tested without Supabase or Shopify
 * credentials. The Shopify calls live in discounts.server.js and the pool
 * bookkeeping in discount-pool.server.js.
 *
 * No .server suffix: the settings UI imports the bounds from here so the
 * form and the server agree on what a valid percentage is.
 */

import { randomBytes } from "crypto";

/**
 * How many unused codes to keep ready per variant.
 *
 * This number is the whole scaling story. Shopify's bulk mutation accepts 250
 * codes a call, and minting 250 per variant is the obvious implementation and
 * the wrong one: the busiest live store sends about three links per product,
 * so 250 would waste 247 codes per product against a store-wide ceiling of
 * 20,000,000 redeem codes that is shared with every other app the merchant
 * runs and is only freed by deletion. Five covers the burst between top-ups
 * while keeping waste per product in single digits.
 */
export const DISCOUNT_BUFFER_SIZE = 5;

/** Codes minted per top-up call. Bounded by Shopify's 250-per-call limit. */
export const DISCOUNT_TOPUP_BATCH = 10;

/**
 * Delete a variant's discount after this long with no link sent for it.
 * Without reaping, a merchant's Discounts page grows forever; with it, the
 * steady state is "products currently drawing comments", which is small.
 */
export const POOL_REAP_AFTER_DAYS = 60;

/**
 * How long a pool survives after its shop stops being eligible, or after the
 * merchant changes the rate.
 *
 * Deleting a discount also invalidates every code issued under it, and those
 * codes are in customers' DMs. A week is longer than anyone leaves a message
 * unopened, and the stale pool hands nothing new out meanwhile because the
 * claim re-checks eligibility and the rate on every call.
 */
export const POOL_REAP_GRACE_DAYS = 7;

export const MIN_DISCOUNT_PERCENTAGE = 1;
export const MAX_DISCOUNT_PERCENTAGE = 50;

/**
 * Alphabet for generated codes. Excludes 0/O/1/I/L so a customer reading the
 * code off a screen and typing it at checkout doesn't get it wrong, which
 * matters because the code is also the attribution key.
 */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

/** Prefix so the codes are recognisable in the merchant's Shopify admin. */
export const CODE_PREFIX = "SR";

/**
 * A single-use code. 31^10 is about 8.2e14, so codes are not guessable by
 * someone poking at checkout, which matters because possession of a code is
 * the only thing gating the discount.
 */
export function generateDiscountCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `${CODE_PREFIX}${out}`;
}

/** Shape check for codes we generated, used to filter order payloads cheaply. */
export function looksLikeOurDiscountCode(code) {
  if (typeof code !== "string") return false;
  return new RegExp(`^${CODE_PREFIX}[${CODE_CHARS}]{${CODE_LENGTH}}$`).test(code);
}

/**
 * Normalise a variant id to gid form.
 *
 * Pools are keyed by variant, and the two sides of that key are written by
 * different code: the pool is created from links_sent.variant_id and the claim
 * happens inside buildCheckoutLink, where callers pass gids, bare numbers and
 * numeric strings interchangeably. Normalising both sides is what stops a pool
 * existing that no reply can ever find.
 */
export function toVariantKey(variantId) {
  if (variantId === null || variantId === undefined) return null;
  const raw = String(variantId).trim();
  if (!raw) return null;
  if (raw.startsWith("gid://")) return raw;
  const numeric = raw.match(/(\d+)$/);
  return numeric ? `gid://shopify/ProductVariant/${numeric[1]}` : null;
}

export function isValidDiscountPercentage(value) {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  return value >= MIN_DISCOUNT_PERCENTAGE && value <= MAX_DISCOUNT_PERCENTAGE;
}

/** Title for the discount as the merchant will see it in their Shopify admin. */
export function discountTitle(percentage, productTitle) {
  const item = (productTitle || "").trim();
  return item
    ? `SocialRepl.ai ${percentage}% off ${item}`
    : `SocialRepl.ai ${percentage}% off`;
}

/**
 * The sentence appended to a reply when a code was attached.
 *
 * Names the product on purpose. The discount is scoped to one variant, so a
 * customer who swaps to something else gets nothing, and a bare "we included
 * a discount" would read as a broken promise at checkout.
 */
export function discountOfferLine(percentage, productTitle) {
  const item = (productTitle || "").trim();
  return item
    ? `I've added ${percentage}% off the ${item} to that link, and it's good for one order.`
    : `I've added ${percentage}% off to that link, and it's good for one order.`;
}

/**
 * Instagram rejects messages over 1000 characters. The discount line is an
 * enhancement, so it is dropped rather than risk turning a good reply into a
 * failed send.
 */
const MAX_REPLY_LENGTH = 1000;

/**
 * Append the discount sentence to a reply, if a code was actually attached.
 *
 * The legacy per-intent branches compose their reply before they know whether
 * a code was claimed, so the sentence is added afterwards. The sales agent
 * doesn't use this: it is told about the discount in the tool result and
 * writes the offer in its own voice.
 *
 * @param {string} replyText
 * @param {{discountCode?: string|null, discountPercentage?: number|null}|null} link
 * @param {string|null} productName
 */
export function appendDiscountLine(replyText, link, productName) {
  if (!replyText || !link?.discountCode || !link?.discountPercentage) return replyText;

  // A reply that already talks about the discount (brand voice can produce
  // one) must not get a second, contradictory sentence.
  if (replyText.includes(`${link.discountPercentage}%`)) return replyText;

  const combined = `${replyText.trimEnd()} ${discountOfferLine(link.discountPercentage, productName)}`;
  return combined.length > MAX_REPLY_LENGTH ? replyText : combined;
}

/** How many codes to mint to bring a pool back to the buffer size. */
export function codesNeeded(availableCount, bufferSize = DISCOUNT_BUFFER_SIZE) {
  const have = Number.isFinite(availableCount) ? Math.max(0, availableCount) : 0;
  return Math.max(0, bufferSize - have);
}
