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
 * Speed is the signal. Templates are sent by Meta's servers the moment the
 * message lands; a person has to read it, decide, and type. On real traffic
 * templates reply in about 3 seconds (median 3.1s at Mark Watts Studios, 3.2s
 * at Shabby 2 Chic) while the merchants who genuinely answer by hand take a
 * median of 29 minutes (Shanesecaresllc) to 100 minutes (Love By Luna). There
 * is nothing in between, so a tight window separates them cleanly.
 *
 * Two conditions, because the cost of a false positive is talking over a real
 * merchant:
 *
 *  1. It is long. Templates carry addresses and opening hours; "sure!" or
 *     "✅ send it to me" (both real Shabby 2 Chic replies) must never qualify.
 *     Someone would have to read a message and type eight or more words inside
 *     the window to be misread.
 *  2. It landed inside FAST_TEMPLATE_DELAY_SEC, or inside the longer
 *     MAX_TEMPLATE_DELAY_SEC while matching an echo already seen in another
 *     customer's thread.
 *
 * Repetition used to be mandatory. That was wrong, and it cost socialrepl.ai's
 * first test: the autoreply fired 1.8 seconds after "Howdy", had nothing to
 * match because it was the first time that text had ever been seen on the
 * account, was therefore read as the owner replying, and paused automation for
 * six hours. The next message was "I love the dawn complete snowboard" and it
 * got nothing. Requiring a second conversation to corroborate means every
 * account with an autoreply sacrifices its first one.
 *
 * When the delay is unknown we return false, so an unrecognised echo still
 * pauses automation. Staying quiet is the recoverable mistake.
 */

/** Below this many words a repeated reply is too short to be a template. */
export const MIN_TEMPLATE_WORDS = 8;

/** Token overlap at or above this counts as the same template. */
export const TEMPLATE_SIMILARITY = 0.8;

/**
 * No human reads a message and types this fast. Enough on its own, which is
 * what lets the very first autoreply on an account be recognised.
 */
export const FAST_TEMPLATE_DELAY_SEC = 10;

/**
 * The outer window, allowed only when the text already matches an echo from
 * another conversation. A merchant could plausibly reply inside this if they
 * happened to be sitting in the thread, so it needs the corroboration.
 */
export const MAX_TEMPLATE_DELAY_SEC = 30;

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

  // Fast enough that no person could have written it, so it stands alone. This
  // is the case that matters on a brand new account, where there is no second
  // conversation to compare against yet.
  if (secondsSinceInbound <= FAST_TEMPLATE_DELAY_SEC) return true;

  // Slower than that is only a template if we have already seen the same words
  // sent to a different customer.
  return otherConversationEchoes.some(
    (other) => echoSimilarity(text, other) >= TEMPLATE_SIMILARITY
  );
}
