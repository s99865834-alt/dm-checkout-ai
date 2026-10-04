/**
 * Telling Instagram's own canned replies apart from the merchant typing.
 *
 * Meta sends us an echo for every outbound message on an account, and anything
 * that isn't ours used to arm the human-takeover pause. That is wrong for
 * Instagram's native Instant Reply and Away Message, which are server-side
 * templates that answer nothing. Shabby 2 Chic had both switched on, so a
 * customer asking "is this dress still available?" got
 *
 *   "Thank you for contacting us. {handle}, we normally respond with 2-4
 *    hours. Our new location is 3200 W 16th Street, Sedalia..."
 *
 * three seconds later, we read that as the owner handling it, and the reply we
 * had already written (product name, price, sizes) was thrown away. The
 * customer got opening hours and nothing else.
 *
 * Three conditions have to hold together before we call an echo a template,
 * because the cost of a false positive is talking over a real merchant:
 *
 *  1. It is long. Templates carry addresses and opening hours; "sure!" or
 *     "✅ send it to me" (both real Shabby 2 Chic replies) must never qualify.
 *  2. It repeats near-verbatim in a different customer's thread. Meta
 *     substitutes the handle and changes nothing else, which lands around 0.9
 *     token similarity. A merchant answering two people says different things.
 *  3. It landed within seconds of the customer's message. Measured on real
 *     traffic, templates reply in ~3s (median 3.1s at Mark Watts Studios, 3.2s
 *     at Shabby 2 Chic) while humans take ~29 minutes (Shanesecaresllc) to
 *     ~100 minutes (Love By Luna). There is a lot of room between those.
 *
 * When the delay is unknown we return false, so an unrecognised echo still
 * pauses automation. Staying quiet is the recoverable mistake.
 */

/** Below this many words a repeated reply is too short to be a template. */
export const MIN_TEMPLATE_WORDS = 8;

/** Token overlap at or above this counts as the same template. */
export const TEMPLATE_SIMILARITY = 0.8;

/** A reply slower than this came from a person, not Meta's automation. */
export const MAX_TEMPLATE_DELAY_SEC = 15;

/**
 * Word tokens, lowercased, punctuation dropped. Keeps digits so opening hours
 * and street numbers still carry signal.
 */
export function echoWords(text) {
  return String(text ?? "")
    .toLowerCase()
    .match(/[\p{L}\p{N}']+/gu) || [];
}

/**
 * Jaccard overlap of the two word sets, 0 to 1.
 *
 * Set-based rather than positional on purpose: the only thing that varies
 * between two firings of the same template is the handle, so one differing
 * token out of thirty should barely move the number.
 */
export function echoSimilarity(a, b) {
  const left = new Set(echoWords(a));
  const right = new Set(echoWords(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  return shared / (left.size + right.size - shared);
}

/**
 * Is this outbound echo one of Instagram's canned templates rather than the
 * merchant replying?
 *
 * @param {Object} args
 * @param {string|null} args.text - echo text (null for media-only echoes)
 * @param {number|null} args.secondsSinceInbound - echo time minus the
 *   customer's last message; null when we cannot tell
 * @param {string[]} args.otherConversationEchoes - the last echo text seen in
 *   this shop's OTHER conversations
 * @returns {boolean}
 */
export function isAutomatedTemplate({
  text,
  secondsSinceInbound = null,
  otherConversationEchoes = [],
} = {}) {
  if (echoWords(text).length < MIN_TEMPLATE_WORDS) return false;

  if (
    secondsSinceInbound === null ||
    secondsSinceInbound === undefined ||
    !Number.isFinite(secondsSinceInbound) ||
    secondsSinceInbound < 0 ||
    secondsSinceInbound > MAX_TEMPLATE_DELAY_SEC
  ) {
    return false;
  }

  return otherConversationEchoes.some(
    (other) => echoSimilarity(text, other) >= TEMPLATE_SIMILARITY
  );
}
