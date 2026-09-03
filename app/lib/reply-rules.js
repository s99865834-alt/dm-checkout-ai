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

/**
 * Is the customer asking whether they're talking to a person or a machine?
 *
 * On 3 Sep 2026 a customer asked Mark Watts Studios "are you bot or real?" and
 * the reply was "I'm a real person here to help you shop". They followed up
 * with "wait im talking to THE Matt Watts???", so they came away believing
 * they'd reached the artist. Nothing in any prompt covered identity, so the
 * model improvised, and the sales framing pushed it towards claiming to be
 * human.
 *
 * That is a lie to a customer, it misrepresents the merchant, and disclosing
 * an automated experience is a platform requirement rather than a nicety. It
 * is far too important to leave to a prompt, so these questions are answered
 * from a fixed string instead of by the model.
 */
// The identity word has to actually end the question. Without this, "is this
// bot polish available" and "is this a real ruby" both read as someone asking
// what we are, and they'd get the canned disclosure instead of an answer.
const ENDS_THE_QUESTION = String.raw`(?=\s*(?:[?.!,;]|$)|\s+or\b)`;

const ASKS_IF_AUTOMATED = [
  String.raw`\b(?:are|r) (?:you|u)(?: a| an)? (?:bot|robot|ai|real|human|real person|actual person)`,
  String.raw`\b(?:is|its|it's) (?:this|that)(?: a| an)? (?:bot|robot|ai|automated|real person)`,
  String.raw`\b(?:bot|robot|ai) or (?:real|human|person|a real person)`,
  String.raw`\b(?:real|human) or (?:a )?(?:bot|robot|ai)`,
  String.raw`\bam i (?:talking|speaking|chatting|texting) (?:to|with)(?: a| an)? (?:bot|robot|ai|human|real person|person)`,
  String.raw`\bare you (?:automated|a computer|chatgpt)`,
  String.raw`\b(?:this|that) is(?: a| an)? (?:bot|ai)`,
].map((body) => new RegExp(body + ENDS_THE_QUESTION));

export function asksIfAutomated(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return ASKS_IF_AUTOMATED.some((re) => re.test(t));
}

/**
 * Does our own reply claim to be a human being?
 *
 * The backstop for phrasings asksIfAutomated doesn't catch. A customer can
 * raise identity in ways no pattern anticipates, and the answer must never be
 * a denial, so any reply that asserts humanity is rewritten before it is sent.
 */
const HUMAN_CLAIMS = [
  /\bi'?m a real person\b/,
  /\bi am a real person\b/,
  /\bi'?m an actual person\b/,
  /\bi'?m (a )?human\b/,
  /\bi am (a )?human\b/,
  /\bi'?m not a (bot|robot|ai|computer)\b/,
  /\bi am not a (bot|robot|ai|computer)\b/,
  /\bnot a bot\b/,
  /\bi'?m real\b/,
  /\bi am real\b/,
  /\byes,? i'?m real\b/,
  /\bspeaking to a real person\b/,
  /\btalking to a real person\b/,
];

export function claimsToBeHuman(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  return HUMAN_CLAIMS.some((re) => re.test(t));
}

/**
 * The honest answer. Says what it is, says what it can do, and leaves the door
 * open to the owner, who does read the inbox and whose manual reply pauses
 * automation for six hours anyway.
 */
export const AUTOMATED_DISCLOSURE =
  "I'm an automated assistant for this store, not a person. I can answer questions about the products and send you links, and the owner reads these messages too if you'd rather hear from them directly.";
