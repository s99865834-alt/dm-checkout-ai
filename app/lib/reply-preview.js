/**
 * Decisions for the pre-connection reply preview.
 *
 * Pure and dependency-free so it can be tested without Supabase or OpenAI
 * credentials. reply-preview.server.js owns the model call and the database
 * write; the wording and the analytics contract live here.
 *
 * No .server suffix: safe to import anywhere.
 */

/**
 * Marks a links_sent row as not real traffic.
 *
 * shop_analytics_totals scopes its links on `ls.failed_reason is null`, so any
 * non-null value keeps a preview out of "checkout links sent". The redirect
 * lookup in click-redirect.server.js selects on link_id alone, so the link
 * still resolves and the merchant can click through to a real checkout.
 */
export const PREVIEW_FAILED_REASON = "preview";

const GENERIC_QUESTION = "What do you sell?";

// Shopify ships a "Gift Card" product on most stores and it sorts first, which
// made it the default pick. It is the worst possible demo: the agent correctly
// asks which denomination the customer wants instead of minting a link, so the
// preview produced a reply with nothing to click, which is the exact weakness
// this card exists to fix. Skipped in favour of something with a price.
const POOR_DEMO_TITLE = /gift\s*card/i;

function usableTitle(product) {
  const title = typeof product?.title === "string" ? product.title.trim() : "";
  return title !== "" ? title : null;
}

/**
 * A question worth pre-filling, using a product the merchant actually stocks.
 *
 * Reads the products already cached on shops.store_context_json at install
 * (five titles, fetched about five seconds after OAuth), so this costs no API
 * call and works before Instagram is connected.
 *
 * A price question is the right default: it is the highest-intent thing a real
 * customer sends, and it exercises catalogue lookup and checkout-link minting,
 * which is the part worth seeing.
 *
 * @param {Object|null} storeContext - shops.store_context_json
 * @returns {string}
 */
export function suggestedPreviewQuestion(storeContext) {
  const products = Array.isArray(storeContext?.products) ? storeContext.products : [];
  const titles = products.map(usableTitle).filter(Boolean);
  // Prefer a real product, but a gift card still beats asking nothing specific
  // on a store that only stocks one.
  const title = titles.find((t) => !POOR_DEMO_TITLE.test(t)) || titles[0];
  if (!title) return GENERIC_QUESTION;
  return `How much is the ${title}?`;
}

// Instagram DMs show URLs as plain text and make them tappable. The preview
// lives in a web page, so the same string has to become a real hyperlink or
// the merchant cannot click through the demo. Trailing sentence punctuation
// is not part of the URL: "here: https://shop.example/a/go/AbCdEf12."
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)]+$/;

/**
 * Split reply text into plain runs and http(s) URLs, for rendering links.
 *
 * @param {unknown} text
 * @returns {Array<{type: "text"|"url", value: string}>}
 */
export function splitTextWithUrls(text) {
  if (typeof text !== "string" || text === "") return [];

  const parts = [];
  let lastIndex = 0;
  const matches = text.matchAll(URL_IN_TEXT);
  for (const match of matches) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    const punct = raw.match(TRAILING_PUNCTUATION)?.[0] || "";
    const url = punct ? raw.slice(0, -punct.length) : raw;
    if (url) parts.push({ type: "url", value: url });
    if (punct) parts.push({ type: "text", value: punct });
    lastIndex = index + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}
