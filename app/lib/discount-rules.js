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

// Web Crypto rather than node:crypto. The settings form and the admin
// dashboard both import the validation bounds and the offer formatting from
// this file, so it ends up in the browser bundle, and a node builtin import
// fails the build there. getRandomValues exists in both runtimes.
function randomBytes(length) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

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

/** A fixed amount off, in the shop's own currency. */
export const MIN_DISCOUNT_AMOUNT = 1;
export const MAX_DISCOUNT_AMOUNT = 10000;

export const DISCOUNT_TYPES = ["percentage", "amount"];

/** Money for reply copy. Falls back to the code when the symbol is unknown. */
function formatMoney(value, currency) {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${code}`;
  }
}

/** "20% off" or "$5 off", for both merchant-facing and customer-facing copy. */
export function describeOffer(type, value, currency) {
  if (type === "amount") return `${formatMoney(value, currency)} off`;
  return `${value}% off`;
}

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

/**
 * Whether a type and value make a usable offer.
 *
 * Percentages stay whole numbers and capped at 50, because a code discount
 * above that is far more likely to be a typo than an intention. Amounts allow
 * cents and are capped high enough not to get in the way of a real store.
 */
export function isValidDiscountOffer(type, value) {
  if (!DISCOUNT_TYPES.includes(type)) return false;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (type === "percentage") return isValidDiscountPercentage(value);
  return value >= MIN_DISCOUNT_AMOUNT && value <= MAX_DISCOUNT_AMOUNT;
}

/** Title for the discount as the merchant will see it in their Shopify admin. */
export function discountTitle(type, value, currency, productTitle) {
  const item = (productTitle || "").trim();
  const offer = describeOffer(type, value, currency);
  return item ? `SocialRepl.ai ${offer} ${item}` : `SocialRepl.ai ${offer}`;
}

/**
 * The sentence appended to a reply when a code was attached.
 *
 * Names the product on purpose. The discount is scoped to one variant, so a
 * customer who swaps to something else gets nothing, and a bare "we included
 * a discount" would read as a broken promise at checkout.
 *
 * Does not print the code. The code is in the link and applies itself; asking
 * someone to copy one into a checkout field is the manual step this product
 * exists to remove, and almost nobody does it. Attribution has to be solved
 * by carrying the reference, not by delegating it to the customer.
 */
export function discountOfferLine(type, value, currency, productTitle) {
  const item = (productTitle || "").trim();
  const subject = item ? `the ${item}` : "it";
  return `I've added ${describeOffer(type, value, currency)} ${subject} to that link, and it's good for one order.`;
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
 * @param {{discountCode?: string|null, discountType?: string|null, discountValue?: number|null, discountCurrency?: string|null}|null} link
 * @param {string|null} productName
 */
export function appendDiscountLine(replyText, link, productName) {
  if (!replyText || !link?.discountCode || !link?.discountValue) return replyText;

  const offer = describeOffer(link.discountType, link.discountValue, link.discountCurrency);

  // A reply that already talks about the discount (brand voice can produce
  // one) must not get a second, contradictory sentence.
  if (replyText.includes(offer)) return replyText;

  const combined = `${replyText.trimEnd()} ${discountOfferLine(
    link.discountType,
    link.discountValue,
    link.discountCurrency,
    productName,
  )}`;
  return combined.length > MAX_REPLY_LENGTH ? replyText : combined;
}

/** How many codes to mint to bring a pool back to the buffer size. */
export function codesNeeded(availableCount, bufferSize = DISCOUNT_BUFFER_SIZE) {
  const have = Number.isFinite(availableCount) ? Math.max(0, availableCount) : 0;
  return Math.max(0, bufferSize - have);
}
