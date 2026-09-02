/**
 * Text rules for the reply pipeline.
 *
 * Pure and dependency-free so tests can import it without Supabase or Shopify
 * credentials, which is why it doesn't live in automation.server.js.
 */

/**
 * Did the customer ask to see the product's *page*, as opposed to asking a
 * question about the product?
 *
 * This gates the only remaining use of product-page links. They are the
 * best-clicking link we send, 12 of 16 clicked against 47% for checkout links,
 * and they have earned $0 in attributed revenue across 38 clicks. They can't
 * do better: a product-page link carries only `ref`, which credits an order
 * within the same browsing session, while a checkout link also carries
 * `attributes[ref]` and still gets the credit days later. So a product page is
 * worth spending our one message on only when the page itself is what was
 * asked for. Every other product question gets answered in the reply, with a
 * checkout link offered for when they're ready.
 *
 * Deliberately conservative: a phrase this misses just gets a checkout link,
 * which is the default we want anyway.
 */
const PRODUCT_PAGE_PHRASES = [
  /\bproduct page\b/,
  /\blink to the (product )?page\b/,
  /\bpage for\b/,
  /\bweb ?site\b/,
  /\bread (the )?(full )?(description|details)\b/,
  /\bfull (description|details)\b/,
  /\bmore (info|information|details)\b/,
  /\b(see|read) (the )?reviews\b/,
];

export function asksForProductPage(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return PRODUCT_PAGE_PHRASES.some((re) => re.test(t));
}

/**
 * Does our own reply admit it doesn't have the answer?
 *
 * When the product data doesn't contain the fact the customer asked about, the
 * honest reply says so. Stapling a checkout link onto "I don't have that
 * information" reads like a machine changing the subject, so the link
 * guarantee skips those replies.
 *
 * Matches explicit admissions only, not ordinary hedging like "not sure which
 * size you need", because the guarantee is the safety net that stops a reply
 * going out with no link at all and shouldn't be switched off lightly.
 */
const NO_ANSWER_PHRASES = [
  /\bdon'?t have (that|this|the|any) (detail|details|info|information)\b/,
  /\bdon'?t have information\b/,
  /\bno information (about|on|regarding)\b/,
  /\b(can'?t|cannot) confirm\b/,
  /\bdon'?t have (that|this) confirmed\b/,
  /\bcouldn'?t find (that|any) (info|information|details)\b/,
  /\bdon'?t have details (about|on)\b/,
];

export function admitsNoAnswer(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return NO_ANSWER_PHRASES.some((re) => re.test(t));
}
